<?php
declare(strict_types=1);
require_once __DIR__ . '/appointment-messages.php';

final class AppointmentConflict extends RuntimeException {}

function appointment_config(): array {
    $file = getenv('BOOKING_MAIL_CONFIG') ?: dirname(__DIR__, 2) . '/booking-private/config.php';
    if (!is_file($file)) throw new RuntimeException('Booking configuration is missing');
    $config = require $file;
    if (!is_array($config)) throw new RuntimeException('Invalid booking configuration');
    $config['_config_file'] = $file;
    return $config;
}

function appointment_directory(array $config): string {
    $directory = $config['state_directory'] ?? dirname($config['_config_file']) . '/state';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('Storage unavailable');
    $resolved = realpath($directory);
    $public = realpath(dirname(__DIR__));
    if ($resolved === false || $public === false) throw new RuntimeException('Storage unavailable');
    $normalize = static fn(string $path): string => rtrim(strtolower(str_replace('\\', '/', $path)), '/');
    if ($normalize($resolved) === $normalize($public) || str_starts_with($normalize($resolved) . '/', $normalize($public) . '/')) {
        throw new RuntimeException('Appointment storage must be outside the public website');
    }
    return $resolved;
}

// A separate lock survives atomic replacement of the JSON file. All status changes
// and overlap checks happen within this one transaction, including across processes.
function appointment_transaction(array $config, callable $callback, bool $write = true, string $name = 'appointments'): mixed {
    if (!preg_match('/^[a-z-]+$/', $name)) throw new RuntimeException('Invalid storage name');
    $directory = appointment_directory($config);
    $path = $directory . '/' . $name . '.json';
    $lock = fopen($directory . '/' . $name . '.lock', 'c+');
    if (!$lock) throw new RuntimeException('Storage unavailable');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Storage unavailable');
        $records = is_file($path) ? json_decode((string) file_get_contents($path), true, 64, JSON_THROW_ON_ERROR) : [];
        if (!is_array($records)) throw new RuntimeException('Invalid appointment storage');
        $result = $callback($records);
        if ($write) {
            $temporary = $directory . '/' . $name . '-' . bin2hex(random_bytes(12)) . '.tmp';
            try {
                if (file_put_contents($temporary, json_encode($records, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), LOCK_EX) === false) throw new RuntimeException('Storage unavailable');
                @chmod($temporary, 0600);
                if (!rename($temporary, $path)) throw new RuntimeException('Storage unavailable');
            } finally {
                if (is_file($temporary)) unlink($temporary);
            }
        }
        return $result;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function appointment_date(string $date): bool {
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone('America/Denver'));
    return $parsed !== false && $parsed->format('Y-m-d') === $date;
}

function appointment_conflicts(array $records, array $candidate, ?string $except = null): bool {
    foreach ($records as $id => $record) {
        if ($id === $except || !in_array($record['status'] ?? '', ['pending', 'confirmed'], true) || $record['date'] !== $candidate['date']) continue;
        if ($candidate['time'] < $record['endTime'] && $record['time'] < $candidate['endTime']) return true;
    }
    return false;
}

function appointment_save_request(array $config, array $appointment): void {
    appointment_transaction($config, static function (array &$records) use ($appointment): void {
        $id = $appointment['id'];
        if (isset($records[$id])) {
            if (!hash_equals($records[$id]['fingerprint'] ?? '', $appointment['fingerprint'])) throw new AppointmentConflict('Request ID already used');
            if (($records[$id]['status'] ?? '') === 'cancelled') throw new AppointmentConflict('Request was cancelled');
            if (appointment_conflicts($records, $appointment, $id)) throw new AppointmentConflict('Time unavailable');
            return;
        }
        if (appointment_conflicts($records, $appointment)) throw new AppointmentConflict('Time unavailable');
        $records[$id] = $appointment + ['status' => 'pending', 'emailSent' => false, 'createdAt' => gmdate('c'), 'updatedAt' => gmdate('c')];
        appointment_plan_messages($records[$id], 'request');
    });
}

function appointment_email_sent(array $config, string $id): void {
    appointment_transaction($config, static function (array &$records) use ($id): void {
        if (!isset($records[$id])) throw new RuntimeException('Appointment missing');
        $records[$id]['emailSent'] = true;
        $records[$id]['updatedAt'] = gmdate('c');
    });
}

function appointment_set_status(array $config, string $id, string $status): array {
    if (!in_array($status, ['confirmed', 'cancelled'], true)) throw new InvalidArgumentException('Invalid status');
    return appointment_transaction($config, static function (array &$records) use ($id, $status): array {
        if (!isset($records[$id])) throw new OutOfBoundsException('Appointment not found');
        $record = $records[$id];
        if ($record['status'] === $status) return $record;
        if ($status === 'confirmed') {
            if ($record['status'] === 'cancelled') throw new AppointmentConflict('A cancelled appointment cannot be confirmed');
            $start = new DateTimeImmutable($record['date'] . 'T' . $record['time'], new DateTimeZone('America/Denver'));
            if ($start <= new DateTimeImmutable('now', new DateTimeZone('America/Denver'))) throw new AppointmentConflict('Appointment is in the past');
            if (appointment_conflicts($records, $record, $id)) throw new AppointmentConflict('Time unavailable');
        }
        $records[$id]['status'] = $status;
        $records[$id]['updatedAt'] = gmdate('c');
        $records[$id][$status === 'confirmed' ? 'confirmedAt' : 'cancelledAt'] = gmdate('c');
        appointment_plan_messages($records[$id], $status === 'confirmed' ? 'confirm' : 'cancel');
        return $records[$id];
    });
}

function appointment_manual(array $config, array $input): array {
    $name = trim(is_string($input['name'] ?? null) ? $input['name'] : '');
    $date = is_string($input['date'] ?? null) ? $input['date'] : '';
    $time = is_string($input['time'] ?? null) ? $input['time'] : '';
    $duration = $input['hours'] ?? null;
    if ($name === '' || strlen($name) > 600 || !appointment_date($date) || !preg_match('/^\d{2}:00$/', $time) || !is_int($duration) || $duration < 1) throw new InvalidArgumentException('Check the appointment name, date, start time and hours');
    // Optional contact details for bookings taken by phone. The public booking
    // flow fills these from its own form; here the owner types what they have.
    $phone = trim(is_string($input['phone'] ?? null) ? $input['phone'] : '');
    $email = trim(is_string($input['email'] ?? null) ? $input['email'] : '');
    $note = trim(is_string($input['note'] ?? null) ? $input['note'] : '');
    if (strlen($phone) > 40 || strlen($email) > 254 || strlen($note) > 500) throw new InvalidArgumentException('Contact details are too long');
    if ($phone !== '' && !preg_match('/^[0-9+().\x20-]{5,40}$/', $phone)) throw new InvalidArgumentException('Check the phone number');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('Check the email address');
    // 'block' marks time the owner has held back — a day off, or hours kept for a
    // regular client. It occupies the hours exactly like a booking; the label only
    // lets the manager show it differently and offer to free it rather than cancel it.
    $kind = ($input['kind'] ?? null) === 'block' ? 'block' : 'booking';
    $hours = json_decode((string) file_get_contents(__DIR__ . '/booking-hours.json'), true, 16, JSON_THROW_ON_ERROR);
    $startHour = (int) substr($time, 0, 2);
    if ($startHour < $hours['openingHour'] || $startHour + $duration > $hours['closingHour']) throw new InvalidArgumentException('Appointment must fit within business hours');
    $start = new DateTimeImmutable($date . 'T' . $time, new DateTimeZone('America/Denver'));
    if ($start <= new DateTimeImmutable('now', new DateTimeZone('America/Denver'))) throw new InvalidArgumentException('Choose a future appointment');
    $id = bin2hex(random_bytes(16));
    $record = ['id' => $id, 'name' => $name, 'email' => $email, 'phone' => $phone, 'note' => $note, 'date' => $date, 'time' => $time, 'endTime' => sprintf('%02d:00', $startHour + $duration), 'scheduledHours' => $duration, 'location' => 'manual', 'services' => [], 'status' => 'confirmed', 'emailSent' => false, 'source' => 'manual', 'kind' => $kind, 'createdAt' => gmdate('c'), 'updatedAt' => gmdate('c'), 'confirmedAt' => gmdate('c')];
    return appointment_transaction($config, static function (array &$records) use ($record, $id): array {
        if (appointment_conflicts($records, $record)) throw new AppointmentConflict('Time unavailable');
        $records[$id] = $record;
        return $record;
    });
}

// Moving an appointment keeps one record, so the customer's contact details and
// selected services survive the change. The old hours are released and the new
// hours blocked in the same transaction as the overlap check, exactly like
// confirming, so two devices cannot move two appointments onto the same hour.
// No customer email is sent: there is no reschedule template, and inventing one
// risks contradicting the confirmation they already hold. A queued day-before
// reminder is re-dated here so it cannot fire against the old time.
function appointment_reschedule(array $config, string $id, string $date, string $time, ?int $hours = null): array {
    if (!appointment_date($date) || !preg_match('/^\d{2}:00$/', $time)) throw new InvalidArgumentException('Check the new date and start time');
    if ($hours !== null && $hours < 1) throw new InvalidArgumentException('Choose at least one hour');
    $limits = json_decode((string) file_get_contents(__DIR__ . '/booking-hours.json'), true, 16, JSON_THROW_ON_ERROR);
    return appointment_transaction($config, static function (array &$records) use ($id, $date, $time, $hours, $limits): array {
        if (!isset($records[$id])) throw new OutOfBoundsException('Appointment not found');
        $record = $records[$id];
        if (($record['status'] ?? '') === 'cancelled') throw new AppointmentConflict('A cancelled appointment cannot be moved');
        $duration = $hours ?? (int) ($record['scheduledHours'] ?? 1);
        if ($duration < 1) throw new InvalidArgumentException('Choose at least one hour');
        $startHour = (int) substr($time, 0, 2);
        if ($startHour < $limits['openingHour'] || $startHour + $duration > $limits['closingHour']) throw new InvalidArgumentException('Appointment must fit within business hours');
        $start = new DateTimeImmutable($date . 'T' . $time, new DateTimeZone('America/Denver'));
        if ($start <= new DateTimeImmutable('now', new DateTimeZone('America/Denver'))) throw new InvalidArgumentException('Choose a future date and time');
        $moved = $record;
        $moved['date'] = $date;
        $moved['time'] = $time;
        $moved['endTime'] = sprintf('%02d:00', $startHour + $duration);
        $moved['scheduledHours'] = $duration;
        if (appointment_conflicts($records, $moved, $id)) throw new AppointmentConflict('Time unavailable');
        if (($moved['notifications']['reminder']['state'] ?? '') === 'queued') {
            $moved['notifications']['reminder']['dueAt'] = $start->sub(new DateInterval('P1D'))->setTimezone(new DateTimeZone('UTC'))->format('c');
        }
        $moved['previousSchedule'] = ['date' => $record['date'], 'time' => $record['time'], 'endTime' => $record['endTime']];
        $moved['rescheduledAt'] = gmdate('c');
        $moved['updatedAt'] = gmdate('c');
        $records[$id] = $moved;
        return $moved;
    });
}

// Appointments whose time has already passed are closed out automatically.
// Cancelling only deactivates queued emails — appointment_plan_messages never
// sends anything on a 'cancel' event, so no customer is ever written to.
// autoExpired records what happened before, so an appointment that simply ran
// its course can still be told apart from one a customer actually cancelled.
function appointment_expire_past(array $config, int $graceMinutes = 0): int {
    $zone = new DateTimeZone('America/Denver');
    $cutoff = (new DateTimeImmutable('now', $zone))->sub(new DateInterval('PT' . max(0, $graceMinutes) . 'M'));

    $due = static function (array $record) use ($cutoff, $zone): bool {
        if (!in_array($record['status'] ?? '', ['pending', 'confirmed'], true)) return false;
        $date = (string) ($record['date'] ?? '');
        $end = (string) ($record['endTime'] ?? '');
        if (!appointment_date($date) || !preg_match('/^\d{2}:00$/', $end)) return false;
        return new DateTimeImmutable($date . 'T' . $end, $zone) <= $cutoff;
    };

    // A read-only pass first, so the ordinary case rewrites nothing at all.
    $waiting = appointment_transaction($config, static function (array &$records) use ($due): bool {
        foreach ($records as $record) if (is_array($record) && $due($record)) return true;
        return false;
    }, false);
    if (!$waiting) return 0;

    return appointment_transaction($config, static function (array &$records) use ($due): int {
        $closed = 0;
        foreach ($records as $id => $record) {
            if (!is_array($record) || !$due($record)) continue;
            $records[$id]['autoExpired'] = true;
            $records[$id]['autoExpiredFrom'] = $record['status'];
            $records[$id]['status'] = 'cancelled';
            $records[$id]['cancelledAt'] = gmdate('c');
            $records[$id]['updatedAt'] = gmdate('c');
            appointment_plan_messages($records[$id], 'cancel');
            $closed++;
        }
        return $closed;
    });
}

function appointment_busy(array $config, string $from, string $to, string $ownRequestId = ''): array {
    if (!appointment_date($from) || !appointment_date($to) || $to < $from || (new DateTimeImmutable($from))->diff(new DateTimeImmutable($to))->days > 31) throw new InvalidArgumentException('Invalid date range');
    // Someone is looking at the public booking calendar. Counting that is
    // best-effort and once per request: a failure must never cost the visitor
    // their list of free hours.
    static $counted = false;
    if (!$counted) {
        $counted = true;
        try {
            require_once __DIR__ . '/visit-store.php';
            visit_record_calendar();
        } catch (Throwable) { /* the hours matter, the tally does not */ }
    }
    return appointment_transaction($config, static function (array &$records) use ($from, $to, $ownRequestId): array {
        $busy = [];
        foreach ($records as $record) {
            // A private, unpredictable receipt ID lets only that submission retry
            // without counting its own reservation as another customer's booking.
            if ($ownRequestId !== '' && hash_equals((string) $record['id'], $ownRequestId)) continue;
            if (in_array($record['status'] ?? '', ['pending', 'confirmed'], true) && $record['date'] >= $from && $record['date'] <= $to) {
                $busy[] = ['date' => $record['date'], 'start' => $record['time'], 'end' => $record['endTime']];
            }
        }
        return $busy;
    }, false);
}
