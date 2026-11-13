<?php
declare(strict_types=1);

/* Reading and writing the weekly online-booking schedule.

   api/booking-hours.json is what booking-core.php consults on every public
   booking request, so writing it is what actually changes the rule. The public
   booking page, however, reads its copy of the same numbers from the generated
   Js/booking-data.js, so both have to move together or the calendar would offer
   hours the server then refuses. Everything else in either file is left exactly
   as it was: only weeklyOnlineHours is rewritten. */

const BOOKING_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function booking_hours_path(): string { return __DIR__ . '/booking-hours.json'; }
function booking_data_path(): string { return dirname(__DIR__) . '/Js/booking-data.js'; }

function booking_hours_read(): array {
    $raw = @file_get_contents(booking_hours_path());
    if ($raw === false) throw new RuntimeException('Cannot read the booking hours');
    $hours = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($hours)) throw new RuntimeException('Invalid booking hours');
    return $hours;
}

/** The seven days as the app shows them: [start, end] in whole hours, or null when closed. */
function booking_schedule(array $hours): array {
    $weekly = is_array($hours['weeklyOnlineHours'] ?? null) ? $hours['weeklyOnlineHours'] : null;
    $fallbackStart = (int) ($hours['onlineStartHour'] ?? $hours['openingHour'] ?? 8);
    $fallbackEnd = (int) ($hours['closingHour'] ?? 20);
    $out = [];
    foreach (BOOKING_WEEKDAYS as $day) {
        if ($weekly === null) { $out[$day] = [$fallbackStart, $fallbackEnd]; continue; }
        $value = $weekly[$day] ?? null;
        $out[$day] = is_array($value) && count($value) === 2 ? [(int) $value[0], (int) $value[1]] : null;
    }
    return $out;
}

/** Checks a schedule sent by the app and returns it in storage shape. */
function booking_schedule_clean(array $input, array $hours): array {
    $floor = (int) ($hours['openingHour'] ?? 8);
    $ceiling = (int) ($hours['closingHour'] ?? 20);
    $clean = [];
    $open = 0;
    foreach (BOOKING_WEEKDAYS as $day) {
        if (!array_key_exists($day, $input)) throw new InvalidArgumentException('Every day of the week is needed');
        $value = $input[$day];
        if ($value === null) { $clean[$day] = null; continue; }
        if (!is_array($value) || count($value) !== 2 || !is_int($value[0]) || !is_int($value[1])) throw new InvalidArgumentException('Check the hours');
        [$start, $end] = $value;
        if ($start < $floor || $end > $ceiling || $end <= $start) {
            throw new InvalidArgumentException(sprintf('Hours have to run between %d:00 and %d:00, start before end', $floor, $ceiling));
        }
        $clean[$day] = [$start, $end];
        $open++;
    }
    if ($open === 0) throw new InvalidArgumentException('At least one day has to stay open');
    return $clean;
}

function booking_write_atomic(string $path, string $contents): void {
    $temporary = dirname($path) . '/.' . basename($path) . '-' . bin2hex(random_bytes(8)) . '.tmp';
    try {
        if (@file_put_contents($temporary, $contents, LOCK_EX) === false) throw new RuntimeException('Cannot write ' . basename($path));
        @chmod($temporary, 0644);
        if (!@rename($temporary, $path)) throw new RuntimeException('Cannot write ' . basename($path));
    } finally {
        if (is_file($temporary)) @unlink($temporary);
    }
}

/** Saves the schedule to both files, or to neither. */
function booking_schedule_save(array $schedule): array {
    $hoursPath = booking_hours_path();
    $dataPath = booking_data_path();
    $lock = fopen($hoursPath, 'r');
    if (!$lock) throw new RuntimeException('Cannot read the booking hours');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('The booking hours are busy, try again');
        $hours = booking_hours_read();
        $hours['weeklyOnlineHours'] = $schedule;

        // The generated file is rewritten first, because it is the one with a
        // shape that can refuse the edit. If its line is missing, nothing is
        // written at all and the site keeps running on the hours it has.
        $data = @file_get_contents($dataPath);
        if ($data === false) throw new RuntimeException('Cannot read Js/booking-data.js');
        $line = 'window.bookingHours = ' . json_encode($hours, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) . ';';
        $patched = preg_replace('/^window\.bookingHours\s*=\s*\{.*?\};$/m', addcslashes($line, '\\$'), $data, 1, $count);
        if ($patched === null || $count !== 1) throw new RuntimeException('Js/booking-data.js is not in the expected shape');

        booking_write_atomic($dataPath, $patched);
        try {
            booking_write_atomic($hoursPath, json_encode($hours, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
        } catch (Throwable $error) {
            // Put the generated file back, so the calendar never offers hours
            // the server would turn down.
            booking_write_atomic($dataPath, $data);
            throw $error;
        }
        return booking_schedule($hours);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
