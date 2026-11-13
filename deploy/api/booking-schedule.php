<?php
declare(strict_types=1);

/* Reading and writing the hours the website offers customers.

   api/booking-hours.json is what booking-core.php consults on every public
   booking request, so writing it is what actually changes the rule. The public
   booking page, however, reads its copy of the same numbers from the generated
   Js/booking-data.js, so both have to move together or the calendar would offer
   hours the server then refuses.

   weeklyOnlineHours is the standing pattern, one window per weekday, and is
   left exactly as it is. dateOverrides is what the manager app writes: a window
   for one date, which wins over that date's weekday pattern. */

const BOOKING_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function booking_hours_path(): string { return __DIR__ . '/booking-hours.json'; }
function booking_data_path(): string { return dirname(__DIR__) . '/Js/booking-data.js'; }
function booking_today(): string { return (new DateTimeImmutable('now', new DateTimeZone('America/Denver')))->format('Y-m-d'); }

function booking_hours_read(): array {
    $raw = @file_get_contents(booking_hours_path());
    if ($raw === false) throw new RuntimeException('Cannot read the booking hours');
    $hours = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
    if (!is_array($hours)) throw new RuntimeException('Invalid booking hours');
    return $hours;
}

/** The standing weekly pattern: [start, end] per weekday, or null when closed. */
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

/** Dates whose hours differ from the weekly pattern, today onwards. */
function booking_overrides(array $hours): array {
    $raw = is_array($hours['dateOverrides'] ?? null) ? $hours['dateOverrides'] : [];
    $today = booking_today();
    $out = [];
    foreach ($raw as $date => $window) {
        if (!is_string($date) || $date < $today) continue;
        $out[$date] = is_array($window) && count($window) === 2 ? [(int) $window[0], (int) $window[1]] : null;
    }
    ksort($out);
    return $out;
}

function booking_weekday_key(string $date): string {
    return strtolower((new DateTimeImmutable($date, new DateTimeZone('America/Denver')))->format('D'));
}

/** Checks the dates the app sent and returns them in storage shape. */
function booking_overrides_clean(array $input, array $hours): array {
    if (count($input) > 120) throw new InvalidArgumentException('Too many days at once');
    $floor = (int) ($hours['openingHour'] ?? 8);
    $ceiling = (int) ($hours['closingHour'] ?? 20);
    $today = booking_today();
    $clean = [];
    foreach ($input as $date => $window) {
        if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new InvalidArgumentException('Check the dates');
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('America/Denver'));
        if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new InvalidArgumentException('Check the dates');
        if ($date < $today) throw new InvalidArgumentException('That day has already passed');
        if ($window === null) { $clean[$date] = null; continue; }
        if (!is_array($window) || count($window) !== 2 || !is_int($window[0]) || !is_int($window[1])) throw new InvalidArgumentException('Check the hours');
        [$start, $end] = $window;
        if ($start < $floor || $end > $ceiling || $end <= $start) {
            throw new InvalidArgumentException(sprintf('Hours have to run between %d:00 and %d:00, start before end', $floor, $ceiling));
        }
        $clean[$date] = [$start, $end];
    }
    if (!$clean) throw new InvalidArgumentException('Pick at least one day');
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

/** Merges the given dates into the stored overrides, writing both files or neither. */
function booking_overrides_save(array $changes): array {
    $hoursPath = booking_hours_path();
    $dataPath = booking_data_path();
    $lock = fopen($hoursPath, 'r');
    if (!$lock) throw new RuntimeException('Cannot read the booking hours');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('The booking hours are busy, try again');
        $hours = booking_hours_read();
        $weekly = booking_schedule($hours);
        $today = booking_today();

        $stored = is_array($hours['dateOverrides'] ?? null) ? $hours['dateOverrides'] : [];
        foreach ($changes as $date => $window) $stored[$date] = $window;

        // Keep the file small and honest: drop days gone by, and drop a day whose
        // hours are the weekday's normal hours anyway — there is nothing to override.
        $kept = [];
        foreach ($stored as $date => $window) {
            if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || $date < $today) continue;
            $normal = $weekly[booking_weekday_key($date)] ?? null;
            $same = is_array($window) && is_array($normal) && count($window) === 2
                && (int) $window[0] === $normal[0] && (int) $window[1] === $normal[1];
            if ($same || ($window === null && $normal === null)) continue;
            $kept[$date] = is_array($window) && count($window) === 2 ? [(int) $window[0], (int) $window[1]] : null;
        }
        ksort($kept);
        if ($kept) $hours['dateOverrides'] = $kept; else unset($hours['dateOverrides']);

        // The generated file goes first, because it is the one whose shape can
        // refuse the edit. If its line is missing, nothing is written at all and
        // the site keeps running on the hours it has.
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
        return booking_overrides($hours);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
