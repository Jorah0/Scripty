package app.scripty.remote;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.regex.Pattern;

/**
 * Scripty Remote for Android: remembers the PC running Scripty and shows its Remote Link page full screen.
 * Pairing, the device token and every control live in that page (served by the desktop app), so the phone app
 * stays in step with the desktop version automatically.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "scripty", KEY_SERVER = "server";
    private static final int DEFAULT_PORT = 47830;
    private static final Pattern HOST = Pattern.compile("^[A-Za-z0-9.-]{1,253}(:\\d{1,5})?$");

    private WebView web;
    private ScrollView connect;
    private EditText address;
    private TextView message;
    private String server; // e.g. http://192.168.1.20:47830/

    static final String EXTRA_UPDATED = "app.scripty.remote.UPDATED";
    private static WeakReference<MainActivity> current = new WeakReference<>(null);
    private String pendingSha;      // update waiting for the "install unknown apps" permission
    private long pendingVersion;
    private boolean justUpdated;
    private volatile boolean updating;

    /** Push update progress to the remote page (shown as an overlay there). Safe from any thread. */
    static void report(String state, String message, int percent) {
        MainActivity a = current.get();
        if (a == null) return;
        a.runOnUiThread(() -> {
            if ("error".equals(state) || "current".equals(state)) a.updating = false;
            try {
                String json = new JSONObject().put("state", state).put("message", message).put("percent", percent)
                        .put("version", Updater.installedVersion(a)).toString();
                a.web.evaluateJavascript("window.onAppUpdate && window.onAppUpdate(" + json + ")", null);
            } catch (Exception ignored) { }
        });
    }

    /** Exposed to the remote page as window.ScriptyApp. The download URL is always the saved PC, never page input. */
    private final class Bridge {
        @JavascriptInterface public long versionCode() { return Updater.installedVersion(MainActivity.this); }
        @JavascriptInterface public void update(String sha256, long versionCode) {
            runOnUiThread(() -> startUpdate(sha256, versionCode));
        }
    }

    private void startUpdate(String sha256, long versionCode) {
        if (sha256 == null || !sha256.matches("[0-9a-f]{64}") || server == null) return;
        if (versionCode <= Updater.installedVersion(this)) { report("current", "Scripty Remote is already up to date.", 100); return; }
        if (updating) return;
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7); // for the "tap to open" notice after updating
        }
        if (!getPackageManager().canRequestPackageInstalls()) {
            pendingSha = sha256; pendingVersion = versionCode;
            report("permission", "Allow “Install unknown apps” for Scripty Remote, then come back. The update continues by itself.", 0);
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        pendingSha = null;
        updating = true;
        final String base = server;
        new Thread(() -> Updater.downloadAndInstall(getApplicationContext(), base, sha256, versionCode, MainActivity::report), "scripty-update").start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = new WeakReference<>(this);
        if (pendingSha != null && getPackageManager().canRequestPackageInstalls()) startUpdate(pendingSha, pendingVersion);
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = new WeakReference<>(this);
        justUpdated = getIntent() != null && getIntent().getBooleanExtra(EXTRA_UPDATED, false);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(UpdatedReceiver.NOTIFICATION_ID);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B0D12"));
        web = buildWeb();
        connect = buildConnect();
        root.addView(web);
        root.addView(connect);
        setContentView(root);

        server = prefs().getString(KEY_SERVER, null);
        if (!openFromIntent(getIntent())) {
            if (server != null) load(server); else showConnect("");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getBooleanExtra(EXTRA_UPDATED, false)) { justUpdated = true; if (server != null) load(server); return; }
        openFromIntent(intent);
    }

    private String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
    }

    /** A scanned pairing QR (http://PC:47830/?pair=...) opens straight into the app and links automatically. */
    private boolean openFromIntent(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"http".equals(data.getScheme()) || data.getHost() == null) return false;
        int port = data.getPort() > 0 ? data.getPort() : DEFAULT_PORT;
        saveServer("http://" + data.getHost() + ":" + port + "/");
        web.loadUrl(data.toString());
        showWeb();
        return true;
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, MODE_PRIVATE); }

    private void saveServer(String base) {
        server = base;
        prefs().edit().putString(KEY_SERVER, base).apply();
    }

    private void load(String base) {
        web.loadUrl(base);
        showWeb();
    }

    /** "192.168.1.20", "http://192.168.1.20:47830/remote" or "my-pc.tailnet.ts.net" -> "http://host:port/". */
    static String normalize(String input) {
        String s = input == null ? "" : input.trim();
        s = s.replaceFirst("(?i)^https?://", "");
        int slash = s.indexOf('/');
        if (slash >= 0) s = s.substring(0, slash);
        if (!HOST.matcher(s).matches()) return null;
        if (!s.contains(":")) s = s + ":" + DEFAULT_PORT;
        return "http://" + s + "/";
    }

    private WebView buildWeb() {
        WebView w = new WebView(this);
        WebSettings ws = w.getSettings();
        ws.setJavaScriptEnabled(true);           // the remote page is an app
        ws.setDomStorageEnabled(true);           // keeps the device token, like the browser version
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        // Tells the desktop which app version this phone runs, so it can offer updates.
        ws.setUserAgentString(ws.getUserAgentString() + " ScriptyRemoteApp/" + Updater.installedVersion(this));
        w.addJavascriptInterface(new Bridge(), "ScriptyApp");
        w.setBackgroundColor(Color.parseColor("#0B0D12"));
        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                Uri base = server == null ? null : Uri.parse(server);
                boolean ours = base != null && "http".equals(u.getScheme()) && base.getHost() != null
                        && base.getHost().equals(u.getHost()) && base.getPort() == u.getPort();
                if (ours) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true; // anything else (help links, key pages) opens in the browser
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (justUpdated) { justUpdated = false; report("done", "Updated to version " + versionName() + ".", 100); }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                showConnect("Can't reach Scripty at " + server + "\n\nOpen Scripty on your PC, go to Remote and switch on Remote Link. "
                        + "This phone must be on the same Wi-Fi (or the same Tailscale network).");
            }
        });
        return w;
    }

    private ScrollView buildConnect() {
        float d = getResources().getDisplayMetrics().density;
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = (int) (26 * d);
        col.setPadding(pad, (int) (64 * d), pad, pad);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        col.addView(logo, new LinearLayout.LayoutParams((int) (84 * d), (int) (84 * d)));

        TextView title = text("Scripty Remote", 26, Color.WHITE, true);
        title.setPadding(0, (int) (14 * d), 0, (int) (6 * d));
        col.addView(title);
        col.addView(text("Control Scripty on your PC from this phone.", 15, Color.parseColor("#8B93A8"), false));

        TextView label = text("PC address", 13, Color.parseColor("#8B93A8"), true);
        label.setGravity(Gravity.START);
        label.setPadding(0, (int) (28 * d), 0, (int) (6 * d));
        col.addView(label, matchWidth());

        address = new EditText(this);
        address.setHint("e.g. 192.168.1.20:47830");
        address.setHintTextColor(Color.parseColor("#5C6479"));
        address.setTextColor(Color.WHITE);
        address.setTextSize(18);
        address.setSingleLine(true);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setPadding((int) (14 * d), (int) (14 * d), (int) (14 * d), (int) (14 * d));
        address.setBackground(box("#141824", "#262D40", 12 * d));
        address.setOnEditorActionListener((v, id, ev) -> { if (id == EditorInfo.IME_ACTION_GO) { submit(); return true; } return false; });
        col.addView(address, matchWidth());

        message = text("", 14, Color.parseColor("#F59E0B"), false);
        message.setGravity(Gravity.START);
        message.setPadding(0, (int) (10 * d), 0, 0);
        col.addView(message, matchWidth());

        Button go = new Button(this);
        go.setText("Connect");
        go.setAllCaps(false);
        go.setTextColor(Color.WHITE);
        go.setTextSize(17);
        go.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable grad = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{Color.parseColor("#8B5CF6"), Color.parseColor("#EC4899")});
        grad.setCornerRadius(14 * d);
        go.setBackground(grad);
        go.setOnClickListener(v -> submit());
        LinearLayout.LayoutParams gp = matchWidth();
        gp.topMargin = (int) (16 * d);
        gp.height = (int) (56 * d);
        col.addView(go, gp);

        TextView help = text("How to connect\n\n"
                + "1. On your PC, open Scripty, click Remote in the left bar and switch on Remote Link.\n"
                + "2. Type one of the addresses it shows (the Wi-Fi one), then enter the 6-digit code.\n\n"
                + "Faster: scan the QR code on the PC with your phone camera and choose “Open with Scripty Remote”.\n\n"
                + "Away from home? Install Tailscale on the PC and this phone and use the PC’s Tailscale address.",
                14, Color.parseColor("#8B93A8"), false);
        help.setGravity(Gravity.START);
        help.setPadding((int) (14 * d), (int) (14 * d), (int) (14 * d), (int) (14 * d));
        help.setBackground(box("#141824", "#262D40", 14 * d));
        LinearLayout.LayoutParams hp = matchWidth();
        hp.topMargin = (int) (28 * d);
        col.addView(help, hp);

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.setBackgroundColor(Color.parseColor("#0B0D12"));
        sv.addView(col);
        return sv;
    }

    private void submit() {
        String base = normalize(address.getText().toString());
        if (base == null) { message.setText("Enter the address shown on the PC, like 192.168.1.20:47830"); return; }
        message.setText("");
        saveServer(base);
        load(base);
    }

    private void showConnect(String msg) {
        if (server != null) address.setText(server.replaceFirst("^http://", "").replaceFirst("/$", ""));
        message.setText(msg);
        connect.setVisibility(View.VISIBLE);
        web.setVisibility(View.GONE);
    }

    private void showWeb() {
        connect.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web.getVisibility() == View.VISIBLE) {
            if (web.canGoBack()) web.goBack(); else showConnect(""); // back from the remote = change PC
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        t.setLineSpacing(0, 1.2f);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private static LinearLayout.LayoutParams matchWidth() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private static GradientDrawable box(String fill, String stroke, float radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(Color.parseColor(fill));
        g.setStroke(2, Color.parseColor(stroke));
        g.setCornerRadius(radius);
        return g;
    }
}
