package app.scripty.remote;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Runs right after Android finishes replacing this app with the new version: reopen Scripty Remote. */
public class UpdatedReceiver extends BroadcastReceiver {
    static final int NOTIFICATION_ID = 4783;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) return;
        Intent open = new Intent(ctx, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(MainActivity.EXTRA_UPDATED, true);
        try { ctx.startActivity(open); } catch (Exception ignored) { }

        // Android 10+ can block apps from opening themselves in the background, so always leave a tap-to-open notice.
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel("updates", "App updates", NotificationManager.IMPORTANCE_HIGH));
            b = new Notification.Builder(ctx, "updates");
        } else {
            b = new Notification.Builder(ctx).setPriority(Notification.PRIORITY_HIGH);
        }
        PendingIntent tap = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        nm.notify(NOTIFICATION_ID, b.setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("Scripty Remote updated")
                .setContentText("Tap to open the new version.")
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build());
    }
}
