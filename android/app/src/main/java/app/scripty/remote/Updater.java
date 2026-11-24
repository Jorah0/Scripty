package app.scripty.remote;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Downloads the Scripty Remote update from the linked PC, verifies it, and hands it to Android's PackageInstaller.
 * Android itself refuses an update signed with a different key, so a tampered APK can never replace this app.
 */
final class Updater {
    interface Progress { void report(String state, String message, int percent); }

    private Updater() { }

    static long installedVersion(Context ctx) {
        try {
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (PackageManager.NameNotFoundException e) { return 0; }
    }

    /** Runs on a background thread. server = "http://host:port/" (the saved PC, never a page-supplied URL). */
    static void downloadAndInstall(Context ctx, String server, String sha256, long targetVersion, Progress p) {
        File apk = new File(ctx.getCacheDir(), "update.apk");
        try {
            p.report("downloading", "Downloading the update from your PC…", 0);
            HttpURLConnection c = (HttpURLConnection) new URL(server + "scripty-remote.apk").openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(30000);
            if (c.getResponseCode() != 200) throw new IOException("the PC answered " + c.getResponseCode());
            long total = c.getContentLengthLong();
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                byte[] buf = new byte[64 * 1024];
                long done = 0;
                int n, lastPct = -1;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    md.update(buf, 0, n);
                    done += n;
                    int pct = total > 0 ? (int) (done * 90 / total) : 45;
                    if (pct != lastPct) { lastPct = pct; p.report("downloading", "Downloading the update from your PC…", pct); }
                }
            } finally { c.disconnect(); }

            if (!hex(md.digest()).equals(sha256)) throw new IOException("the download was damaged (checksum mismatch). Try again.");
            PackageInfo info = ctx.getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
            if (info == null || !ctx.getPackageName().equals(info.packageName)) throw new IOException("the file is not a Scripty Remote app.");
            long newVersion = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            if (newVersion < targetVersion || newVersion <= installedVersion(ctx)) throw new IOException("the PC sent an older version.");

            p.report("installing", "Installing… Scripty Remote will restart by itself.", 95);
            install(ctx, apk);
        } catch (Exception e) {
            apk.delete();
            p.report("error", "Update failed: " + e.getMessage(), 0);
        }
    }

    private static void install(Context ctx, File apk) throws IOException {
        PackageInstaller installer = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        // Android 12+: once this app installed itself, later self-updates need no confirmation tap.
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (OutputStream out = session.openWrite("base.apk", 0, apk.length()); InputStream in = new FileInputStream(apk)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                session.fsync(out);
            }
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent result = PendingIntent.getBroadcast(ctx, id, new Intent(ctx, InstallReceiver.class), flags);
            session.commit(result.getIntentSender());
        } finally {
            apk.delete();
        }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder(b.length * 2);
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }
}
