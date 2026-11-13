<?php
declare(strict_types=1);
// Closes out appointments whose time has passed. The manager app already does
// this whenever it loads, so this script is optional — it only matters if you
// want records tidied while nobody has the app open. Safe to run every minute:
// it writes nothing when there is nothing to close, and it never emails anyone.
//
// Hostinger: Websites -> Dashboard -> Cron Jobs, alongside the notification job:
//   /usr/bin/php /home/USER/domains/massagesjulieta.com/public_html/api/expire-appointments.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require_once __DIR__ . '/appointment-store.php';

try {
    $closed = appointment_expire_past(appointment_config());
    if ($closed > 0) {
        fwrite(STDOUT, sprintf("Closed %d appointment%s whose time had passed.\n", $closed, $closed === 1 ? '' : 's'));
    }
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, 'Could not close past appointments: ' . $exception->getMessage() . "\n");
    exit(1);
}
