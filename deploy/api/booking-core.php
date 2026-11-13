<?php
declare(strict_types=1);
require_once __DIR__ . '/booking-owner-email.php';

final class BookingInputError extends RuntimeException {
    public function __construct(string $message, public readonly string $reason = 'invalid_request') {
        parent::__construct($message);
    }
}

function booking_text(array $input, string $key, int $maximum, bool $required = false): string {
    $value = $input[$key] ?? '';
    if (!is_string($value) || strlen($value) > $maximum || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $value)) {
        throw new BookingInputError('Invalid ' . $key);
    }
    $value = trim($value);
    if ($required && $value === '') throw new BookingInputError('Missing ' . $key);
    return $value;
}

function booking_prepare(array $input, array $catalog, array $config): array {
    if (booking_text($input, 'website', 200) !== '') throw new BookingInputError('Invalid request');
    $requestId = booking_text($input, 'requestId', 36, true);
    if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i', $requestId)) throw new BookingInputError('Invalid request ID');
    if (!isset($input['contact']) || !is_array($input['contact'])) throw new BookingInputError('Missing contact');
    $name = booking_text($input['contact'], 'name', 600, true);
    $email = booking_text($input['contact'], 'email', 254, true);
    $phone = booking_text($input['contact'], 'phone', 60, true);
    if (preg_match('/[\r\n]/', $name . $email . $phone) || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new BookingInputError('Invalid contact');
    $location = booking_text($input, 'location', 20, true);
    if (!in_array($location, ['studio', 'at-home'], true)) throw new BookingInputError('Invalid location');
    $homeAddress = $location === 'at-home' ? booking_text($input, 'homeAddress', 2000, true) : '';
    $guests = $input['guests'] ?? null;
    if (!in_array($guests, ['1', '2'], true)) throw new BookingInputError('Invalid guests');
    $pressure = booking_text($input, 'pressure', 30);
    if (!in_array($pressure, ['No preference', 'Light', 'Medium', 'Firm', 'Not applicable'], true)) throw new BookingInputError('Invalid pressure');
    $date = booking_text($input, 'date', 10, true);
    $time = booking_text($input, 'time', 5, true);
    $zone = new DateTimeZone('America/Denver');
    $appointment = DateTimeImmutable::createFromFormat('!Y-m-d H:i', $date . ' ' . $time, $zone);
    if (!$appointment || $appointment->format('Y-m-d H:i') !== $date . ' ' . $time || $appointment <= new DateTimeImmutable('now', $zone)) {
        throw new BookingInputError('Choose a future appointment');
    }
    $minutes = ((int) substr($time, 0, 2)) * 60 + (int) substr($time, 3, 2);
    $hours = json_decode(file_get_contents(__DIR__ . '/booking-hours.json'), true, 16, JSON_THROW_ON_ERROR);
    // Website requests use each weekday's online hours; other hours stay manager-only.
    $opening = ($hours['onlineStartHour'] ?? $hours['openingHour']) * 60;
    $closing = $hours['closingHour'] * 60;
    // A single date set from the manager app wins over the weekday pattern:
    // [start, end] opens that date, null closes it.
    $overrides = is_array($hours['dateOverrides'] ?? null) ? $hours['dateOverrides'] : [];
    if (array_key_exists($date, $overrides)) {
        $window = $overrides[$date];
        if (!is_array($window) || count($window) !== 2) throw new BookingInputError('This day is not available for online booking', 'invalid_time');
        $opening = (int) $window[0] * 60;
        $closing = (int) $window[1] * 60;
    } elseif (isset($hours['weeklyOnlineHours']) && is_array($hours['weeklyOnlineHours'])) {
        $day = $hours['weeklyOnlineHours'][strtolower($appointment->format('D'))] ?? null;
        if (!is_array($day) || count($day) !== 2) throw new BookingInputError('This day is not available for online booking', 'invalid_time');
        $opening = (int) $day[0] * 60;
        $closing = (int) $day[1] * 60;
    }
    if ($minutes < $opening || $minutes >= $closing || $minutes % 60 !== 0) throw new BookingInputError('Choose a start time on the hour', 'invalid_time');
    $services = $input['services'] ?? null;
    if (!is_array($services) || !array_is_list($services) || count($services) < 1 || count($services) > count($catalog)) throw new BookingInputError('Invalid services');
    $byId = array_column($catalog, null, 'id');
    $seen = [];
    $lines = [];
    $total = 0;
    $totalQuantity = 0;
    $totalMinutes = 0;
    foreach ($services as $service) {
        if (!is_array($service)) throw new BookingInputError('Invalid service');
        $id = booking_text($service, 'id', 80, true);
        $quantity = $service['quantity'] ?? null;
        if (!isset($byId[$id]) || isset($seen[$id]) || !is_int($quantity) || $quantity < 1 || $quantity > 20) throw new BookingInputError('Invalid service quantity');
        $seen[$id] = true;
        $totalQuantity += $quantity;
        if ($totalQuantity > 20) throw new BookingInputError('Too many services');
        $item = $byId[$id];
        if (!is_int($item['maximumMinutes'] ?? null) || $item['maximumMinutes'] <= 0) throw new BookingInputError('Invalid catalog duration');
        $totalMinutes += $item['maximumMinutes'] * $quantity;
        $price = $item['price'] * $quantity;
        $total += $price;
        $durationEs = strtr($item['duration'], ['hours' => 'horas', 'hour' => 'hora', 'minutes' => 'minutos', 'minute' => 'minuto']);
        $lines[] = $quantity . ' × ' . ($item['titleEs'] ?? $item['title']) . ' | ' . $durationEs . ' por sesión | $' . $price . ' USD';
    }
    $scheduledHours = (int) ceil($totalMinutes / 60);
    if ($minutes + $scheduledHours * 60 > $closing) throw new BookingInputError('Not enough consecutive hours before closing', 'insufficient_time');
    $appointmentEnd = $appointment->modify('+' . $scheduledHours . ' hours');
    $requests = booking_text($input, 'requests', 2000);
    $body = [
        'Nueva solicitud de cita', 'Datos del cliente',
        'Nombre: ' . $name, 'Correo electrónico: ' . $email, 'Teléfono: ' . ($phone ?: 'No proporcionado'), '',
        'Cita solicitada', 'Fecha: ' . booking_owner_date($appointment),
        'Horario: ' . $appointment->format('H:i') . '–' . $appointmentEnd->format('H:i') . ' — hora de la montaña (America/Denver)',
        'Lugar: ' . ($location === 'studio' ? 'Estudio — Retreat at Sky Mountain, 485 N 2170 W, Apt T11, Hurricane, UT 84737' : 'Masaje a domicilio — ' . $homeAddress),
        'Quién viene: ' . ($guests === '1' ? 'Solo el cliente' : 'El cliente y un acompañante'), 'Preferencia de presión: ' . booking_owner_spanish($pressure),
        'Horas reservadas: ' . $scheduledHours, '',
        'Servicios seleccionados', ...$lines, 'Cantidad de servicios: ' . $totalQuantity, 'Total estimado: $' . $total . ' USD', '',
        'Solicitudes adicionales', $requests === '' ? 'Sin preferencia' : booking_owner_spanish($requests),
    ];
    // Omit clinical details unless the owner explicitly enables this separately.
    if (($config['include_clinical_history'] ?? false) === true && isset($input['clinicalHistory'])) {
        $body[] = '';
        $body[] = 'Historial clínico';
        $body[] = booking_owner_clinical(booking_text($input, 'clinicalHistory', 12000));
        foreach (['minor' => 'Reserva a nombre de un menor', 'pregnant' => 'Embarazo indicado'] as $field => $label) {
            if (isset($input[$field]) && !is_bool($input[$field])) throw new BookingInputError('Invalid ' . $field);
            if (($input[$field] ?? false) === true) $body[] = $label . ': Sí';
        }
    }
    $body[] = '';
    $body[] = 'Siguiente paso';
    $body[] = 'Esta cita está pendiente de confirmación. El horario ya está reservado. Confirma la solicitud en el gestor de citas para enviar al cliente únicamente el correo de confirmación.';
    $reminder = $input['emailReminder'] ?? false;
    $language = $input['language'] ?? 'en';
    if (!is_bool($reminder) || !in_array($language, ['en', 'es'], true)) throw new BookingInputError('Invalid notification preference');
    $body[] = 'Referencia de la solicitud: ' . $requestId;
    $appointmentRecord = [
        'id' => $requestId, 'name' => $name, 'email' => $email, 'phone' => $phone,
        'date' => $date, 'time' => $time, 'endTime' => $appointmentEnd->format('H:i'),
        'scheduledHours' => $scheduledHours, 'location' => $location, 'guests' => $guests, 'source' => 'website',
        'homeAddress' => $homeAddress, 'emailReminder' => false, 'language' => $language,
        'services' => array_map(static fn(array $service): array => ['id' => $service['id'], 'title' => $byId[$service['id']]['title'], 'titleEs' => $byId[$service['id']]['titleEs'] ?? $byId[$service['id']]['title'], 'quantity' => $service['quantity']], $services),
    ];
    $appointmentRecord['fingerprint'] = hash('sha256', json_encode($appointmentRecord, JSON_THROW_ON_ERROR));
    return ['requestId' => $requestId, 'name' => $name, 'replyTo' => $email, 'appointment' => $appointmentRecord,
        'subject' => 'Nueva solicitud de cita — ' . booking_owner_date($appointment), 'body' => implode("\n", $body), 'html' => booking_owner_html($body)];
}

function booking_mail_content(object $mail, array $message): void {
    if (isset($message['html'])) {
        $mail->isHTML(true);
        $mail->Body = $message['html'];
        $mail->AltBody = $message['body'];
    } else {
        $mail->isHTML(false);
        $mail->Body = $message['body'];
        $mail->AltBody = '';
    }
}

function booking_mailer(array $config, array $message): void {
    require_once __DIR__ . '/vendor/PHPMailer/src/Exception.php';
    require_once __DIR__ . '/vendor/PHPMailer/src/SMTP.php';
    require_once __DIR__ . '/vendor/PHPMailer/src/PHPMailer.php';
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $config['smtp_host'];
    $mail->Port = $config['smtp_port'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['smtp_username'];
    $mail->Password = $config['smtp_password'];
    $mail->SMTPSecure = $mail->Port === 465 ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Timeout = 20;
    $mail->CharSet = 'UTF-8';
    $mail->setFrom($config['from_email'], 'Julieta Massage and Wellness');
    $mail->addAddress($message['recipient'] ?? $config['recipient_email']);
    $mail->Timeout = min(20, max(1, (int) ($message['timeout'] ?? 20)));
    if (isset($message['messageId'])) $mail->MessageID = $message['messageId'];
    $mail->addReplyTo($message['replyTo'], $message['name']);
    $mail->Subject = $message['subject'];
    booking_mail_content($mail, $message);
    $mail->send();
}
