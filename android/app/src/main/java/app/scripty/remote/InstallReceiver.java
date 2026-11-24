package app.scripty.remote;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Result of an update install session. */
public class InstallReceiver extends BroadcastReceiver {
    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // First update (or Android 11 and older): Android asks the user to confirm with one tap.
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(confirm);
                MainActivity.report("confirm", "Tap “Update” to finish installing.", 95);
            }
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            MainActivity.report("installing", "Installed. Restarting Scripty Remote…", 100); // Android replaces the app now; UpdatedReceiver reopens it
        } else {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            MainActivity.report("error", status == PackageInstaller.STATUS_FAILURE_ABORTED ? "Update cancelled." : "Update failed: " + (msg == null ? "unknown error" : msg), 0);
        }
    }
}
