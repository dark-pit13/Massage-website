<?php
declare(strict_types=1);
// Installable owner app for appointments. Same private sign-in, same records and
// the same availability as /manage-appointments.php — this page is the phone-shaped
// view of them. Bookmark or install it; it is not linked in customer navigation.
//
// Language: Spanish by default, English on request. The sign-in screen is
// translated here because no script runs before sign-in; everything inside the
// app carries data-i18n keys and is translated by Js/appointments-app.js, so the
// toggle switches instantly without reloading.
ini_set('display_errors', '0');
require_once __DIR__ . '/api/appointment-auth.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://use.typekit.net; font-src 'self' https://use.typekit.net; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");

$lang = 'es';
if (isset($_GET['lang']) && in_array($_GET['lang'], ['en', 'es'], true)) {
    $lang = $_GET['lang'];
    setcookie('booking_app_lang', $lang, ['expires' => time() + 31536000, 'path' => '/', 'httponly' => false, 'samesite' => 'Strict', 'secure' => appointment_https()]);
    header('Location: /appointments-app.php', true, 303);
    exit;
}
if (isset($_COOKIE['booking_app_lang']) && in_array($_COOKIE['booking_app_lang'], ['en', 'es'], true)) {
    $lang = $_COOKIE['booking_app_lang'];
}
$es = $lang === 'es';

$error = '';
$configured = false;
$authenticated = false;
try {
    $config = appointment_config();
    $configured = is_string($config['admin_password_hash'] ?? null) && $config['admin_password_hash'] !== '';
    if (!appointment_https() && !appointment_local()) {
        $destination = $config['allowed_origins'][0] ?? '';
        if (is_string($destination) && str_starts_with($destination, 'https://')) { header('Location: ' . rtrim($destination, '/') . '/appointments-app.php', true, 303); exit; }
        throw new RuntimeException('HTTPS is required');
    }
    appointment_session();
    $authenticated = appointment_authenticated($config);
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && $configured) {
        if (!appointment_origin($config) || !appointment_csrf((string) ($_POST['token'] ?? ''))) {
            http_response_code(403);
            $error = $es ? 'El formulario caducó. Inténtalo de nuevo.' : 'The sign-in form expired. Please try again.';
        } elseif (($_POST['action'] ?? '') === 'logout') {
            $_SESSION = [];
            session_regenerate_id(true);
            $_SESSION['booking_csrf'] = bin2hex(random_bytes(32));
            header('Location: /appointments-app.php', true, 303); exit;
        } elseif (is_string($_POST['password'] ?? null) && strlen($_POST['password']) <= 1024 && appointment_login($config, $_POST['password'])) {
            header('Location: /appointments-app.php', true, 303); exit;
        } else {
            http_response_code(401);
            $error = $es ? 'La contraseña no es correcta.' : 'The password is incorrect.';
        }
    }
} catch (LengthException $exception) {
    http_response_code(429);
    $error = $es ? 'Demasiados intentos. Espera 15 minutos.' : $exception->getMessage();
} catch (Throwable $exception) {
    http_response_code(503);
    $error = $es
        ? 'La aplicación de citas todavía no está configurada. Sigue APPOINTMENTS-SETUP.md para definir tu contraseña privada.'
        : 'The appointment app is not configured yet. Follow APPOINTMENTS-SETUP.md to set your private manager password.';
}
if (!$configured && $error === '') {
    http_response_code(503);
    $error = $es
        ? 'La aplicación de citas todavía no está configurada. Sigue APPOINTMENTS-SETUP.md para definir tu contraseña privada.'
        : 'The appointment app is not configured yet. Follow APPOINTMENTS-SETUP.md to set your private manager password.';
}

$token = htmlspecialchars((string) ($_SESSION['booking_csrf'] ?? ''), ENT_QUOTES, 'UTF-8');
$zone = new DateTimeZone('America/Denver');
$today = (new DateTimeImmutable('today', $zone))->format('Y-m-d');
$hours = json_decode((string) file_get_contents(__DIR__ . '/api/booking-hours.json'), true);
$opening = (int) ($hours['openingHour'] ?? 9);
$closing = (int) ($hours['closingHour'] ?? 18);
$clock = static fn(int $h): string => $es ? sprintf('%d:00', $h) : sprintf('%d:00 %s', $h % 12 === 0 ? 12 : $h % 12, $h < 12 ? 'AM' : 'PM');
$e = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="<?= $lang ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="csrf-token" content="<?= $token ?>">
<meta name="app-today" content="<?= $today ?>">
<meta name="app-opening-hour" content="<?= $opening ?>">
<meta name="app-closing-hour" content="<?= $closing ?>">
<meta name="theme-color" content="#16332B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="<?= $es ? 'Citas' : 'Appointments' ?>">
<title><?= $es ? 'Citas' : 'Appointments' ?> | Julieta Betancourt</title>
<link rel="manifest" href="/appointments-app.webmanifest">
<link rel="apple-touch-icon" href="/Images/app-icon-180.png">
<link rel="icon" href="/Images/app-icon-192.png" sizes="192x192">
<link rel="stylesheet" href="https://use.typekit.net/sls6qmt.css">
<link rel="stylesheet" href="/css/appointments-app.css?v=8">
<?php if ($authenticated): ?><script src="/Js/appointments-app.js?v=8" defer></script><?php else: ?><script src="/Js/appointments-gate.js?v=1" defer></script><?php endif; ?>
</head>
<body class="<?= $authenticated ? 'is-app' : 'is-gate' ?>">
<?php if (!$authenticated): ?>
<main class="gate">
    <div class="gate-mark" aria-hidden="true"><span>JB</span></div>
    <h1><?= $es ? 'Citas' : 'Appointments' ?></h1>
    <p class="gate-sub"><?= $es ? 'Gestión privada de Julieta Betancourt Massage &amp; Wellness' : 'Private manager for Julieta Betancourt Massage &amp; Wellness' ?></p>
    <?php if ($error !== ''): ?><p class="gate-notice" role="alert"><?= $e($error) ?></p><?php endif; ?>
    <?php if ($configured): ?>
    <form class="gate-form" method="post">
        <input type="hidden" name="token" value="<?= $token ?>">
        <label for="gate-password"><?= $es ? 'Contraseña' : 'Manager password' ?></label>
        <input id="gate-password" type="password" name="password" autocomplete="current-password" required maxlength="1024" autocapitalize="off" autocorrect="off" spellcheck="false">
        <button type="submit"><?= $es ? 'Entrar' : 'Sign in' ?></button>
    </form>
    <p class="gate-help"><?= $es ? 'La sesión se cierra tras 30 minutos sin actividad. Cierra sesión en dispositivos compartidos.' : 'Sessions end after 30&nbsp;minutes of inactivity. Sign out on shared devices.' ?></p>
    <?php endif; ?>
    <p class="gate-lang"><a href="?lang=<?= $es ? 'en' : 'es' ?>"><?= $es ? 'English' : 'Español' ?></a></p>
</main>
<?php else: ?>
<div class="app" data-lang="<?= $lang ?>">

    <header class="topbar">
        <div class="topbar-text">
            <p class="topbar-eyebrow" id="topbar-eyebrow">&nbsp;</p>
            <h1 class="topbar-title" id="topbar-title">&nbsp;</h1>
        </div>
        <div class="topbar-tools">
            <button type="button" class="icon-button lang-button" id="lang-button" aria-label="Español / English"><span id="lang-label">EN</span></button>
            <button type="button" class="icon-button" id="refresh-button" data-i18n-label="refresh">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/></svg>
            </button>
            <form method="post" class="signout-form">
                <input type="hidden" name="token" value="<?= $token ?>">
                <input type="hidden" name="action" value="logout">
                <button type="submit" class="icon-button" data-i18n-label="signOut">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/></svg>
                </button>
            </form>
        </div>
    </header>

    <p class="connection" id="connection" role="status" hidden></p>

    <main class="screens">

        <!-- ───────── Today ───────── -->
        <section class="screen is-active" id="screen-today" tabindex="-1">
            <h2 class="sr-only" data-i18n="tabToday"></h2>
            <article class="hero" id="hero">
                <p class="hero-label" id="hero-label"></p>
                <p class="hero-headline" id="hero-headline">—</p>
                <p class="hero-detail" id="hero-detail"></p>
                <div class="hero-stats">
                    <div><strong id="stat-today">–</strong><span data-i18n="statToday"></span></div>
                    <div><strong id="stat-pending">–</strong><span data-i18n="statPending"></span></div>
                    <div><strong id="stat-week">–</strong><span data-i18n="statWeek"></span></div>
                </div>
            </article>
            <div class="quick">
                <button type="button" class="quick-button" data-open-add>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>
                    <span data-i18n="quickPhone"></span>
                </button>
                <button type="button" class="quick-button" data-open-block="hours">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M9 14h6"/></svg>
                    <span data-i18n="quickBlock"></span>
                </button>
                <button type="button" class="quick-button" data-open-block="range">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>
                    <span data-i18n="quickDaysOff"></span>
                </button>
                <button type="button" class="quick-button" data-open-free>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 11V8a5 5 0 0 1 9.9-1"/><rect x="4" y="11" width="16" height="10" rx="2"/></svg>
                    <span data-i18n="quickFree"></span>
                </button>
                <button type="button" class="quick-button" data-open-visits>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 19V11M10 19V5M16 19v-6M22 19H2"/></svg>
                    <span data-i18n="quickVisits"></span>
                </button>
                <button type="button" class="quick-button" data-open-hours>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>
                    <span data-i18n="quickHours"></span>
                </button>
                <button type="button" class="quick-button" data-goto="requests">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6L9 17l-5-5"/></svg>
                    <span data-i18n="quickApprove"></span>
                </button>
            </div>
            <h3 class="section-title" data-i18n="todaySchedule"></h3>
            <div class="timeline" id="today-timeline"></div>
            <h3 class="section-title" data-i18n="nextUp"></h3>
            <div class="list" id="today-upcoming"></div>
        </section>

        <!-- ───────── Calendar ───────── -->
        <section class="screen" id="screen-calendar" tabindex="-1" hidden>
            <h2 class="sr-only" data-i18n="tabCalendar"></h2>
            <div class="segmented" role="tablist" data-i18n-label="calendarRange">
                <button type="button" role="tab" aria-selected="true" data-range="day" data-i18n="rangeDay"></button>
                <button type="button" role="tab" aria-selected="false" data-range="week" data-i18n="rangeWeek"></button>
                <button type="button" role="tab" aria-selected="false" data-range="month" data-i18n="rangeMonth"></button>
            </div>
            <div class="stepper">
                <button type="button" class="icon-button" id="range-prev" data-i18n-label="previous">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 19l-7-7 7-7"/></svg>
                </button>
                <p id="range-label">—</p>
                <button type="button" class="icon-button" id="range-next" data-i18n-label="next">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg>
                </button>
            </div>
            <button type="button" class="link-button" id="range-today" data-i18n="jumpToday"></button>
            <div id="calendar-body"></div>
        </section>

        <!-- ───────── Requests ───────── -->
        <section class="screen" id="screen-requests" tabindex="-1" hidden>
            <h2 class="sr-only" data-i18n="tabRequests"></h2>
            <p class="screen-intro" data-i18n="requestsIntro"></p>
            <div class="list" id="requests-list"></div>
        </section>

        <!-- ───────── All ───────── -->
        <section class="screen" id="screen-all" tabindex="-1" hidden>
            <h2 class="sr-only" data-i18n="tabAll"></h2>
            <label class="search">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"/></svg>
                <input type="search" id="search-input" data-i18n-placeholder="searchPlaceholder" data-i18n-label="searchPlaceholder" autocapitalize="off" autocorrect="off">
            </label>
            <div class="chips" role="group" data-i18n-label="filterByStatus">
                <button type="button" class="chip is-on" data-status="all" data-i18n="filterAll"></button>
                <button type="button" class="chip" data-status="pending" data-i18n="filterPending"></button>
                <button type="button" class="chip" data-status="confirmed" data-i18n="filterConfirmed"></button>
                <button type="button" class="chip" data-status="cancelled" data-i18n="filterCancelled"></button>
            </div>
            <div class="list" id="all-list"></div>
        </section>

    </main>

    <nav class="tabbar" data-i18n-label="sections">
        <button type="button" class="tab is-on" data-tab="today" aria-current="page">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>
            <span data-i18n="tabToday"></span>
        </button>
        <button type="button" class="tab" data-tab="calendar">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
            <span data-i18n="tabCalendar"></span>
        </button>
        <button type="button" class="tab" data-tab="requests">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
            <span data-i18n="tabRequests"></span>
            <span class="tab-badge" id="tab-badge" hidden>0</span>
        </button>
        <button type="button" class="tab" data-tab="all">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
            <span data-i18n="tabAll"></span>
        </button>
    </nav>

    <button type="button" class="fab" id="fab" data-i18n-label="addToCalendar">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>
    </button>

    <p class="toast" id="toast" role="status" aria-live="polite" hidden></p>

    <!-- ───────── Detail sheet ───────── -->
    <dialog class="sheet" id="sheet-detail">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="sheet-body">
            <span class="status" id="detail-status">—</span>
            <h2 id="detail-name">—</h2>
            <p class="sheet-when" id="detail-when">—</p>
            <dl class="facts" id="detail-facts"></dl>
            <p class="warn" id="detail-warn" hidden data-i18n="detailWarn"></p>
            <div class="sheet-actions" id="detail-actions"></div>
            <p class="sheet-note" data-i18n="detailNote"></p>
        </div>
    </dialog>

    <!-- ───────── What to add ───────── -->
    <dialog class="sheet" id="sheet-new">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="sheet-body">
            <h2 data-i18n="addTitle"></h2>
            <div class="sheet-actions">
                <button type="button" class="primary" data-open-add data-i18n="addPhoneBooking"></button>
                <button type="button" data-open-block="hours" data-i18n="addBlockHours"></button>
                <button type="button" data-open-block="day" data-i18n="addDayOff"></button>
                <button type="button" data-open-block="range" data-i18n="addDaysOff"></button>
                <button type="button" data-open-free data-i18n="addFreeTime"></button>
                <button type="button" data-open-hours data-i18n="addWeeklyHours"></button>
                <button type="button" class="ghost" data-close-sheet data-i18n="cancel"></button>
            </div>
        </div>
    </dialog>

    <!-- ───────── Block time sheet ───────── -->
    <dialog class="sheet" id="sheet-block">
        <div class="sheet-grip" aria-hidden="true"></div>
        <form class="sheet-body" id="block-form">
            <h2 data-i18n="blockTitle"></h2>
            <p class="sheet-sub" data-i18n="blockIntro"></p>

            <div class="segmented" role="tablist" data-i18n-label="blockHowMuch">
                <button type="button" role="tab" aria-selected="true" data-block-mode="hours" data-i18n="blockModeHours"></button>
                <button type="button" role="tab" aria-selected="false" data-block-mode="day" data-i18n="blockModeDay"></button>
                <button type="button" role="tab" aria-selected="false" data-block-mode="range" data-i18n="blockModeRange"></button>
            </div>

            <label><span data-i18n="fieldLabel"></span> <span class="opt" data-i18n="onlyYouSee"></span>
                <input name="label" type="text" maxlength="150" value="" autocomplete="off">
            </label>
            <div class="chips" data-i18n-label="quickLabels">
                <button type="button" class="chip" data-label-key="presetUnavailable" data-i18n="presetUnavailable"></button>
                <button type="button" class="chip" data-label-key="presetDayOff" data-i18n="presetDayOff"></button>
                <button type="button" class="chip" data-label-key="presetRegular" data-i18n="presetRegularShort"></button>
                <button type="button" class="chip" data-label-key="presetPersonal" data-i18n="presetPersonal"></button>
                <button type="button" class="chip" data-label-key="presetLunch" data-i18n="presetLunch"></button>
            </div>

            <div class="row" data-block-field="hours">
                <label><span data-i18n="fieldDate"></span>
                    <input name="date" type="date" min="<?= $today ?>">
                </label>
                <label><span data-i18n="fieldStart"></span>
                    <select name="time">
                        <?php for ($hour = $opening; $hour < $closing; $hour++): ?>
                        <option value="<?= sprintf('%02d:00', $hour) ?>"><?= $e($clock($hour)) ?></option>
                        <?php endfor; ?>
                    </select>
                </label>
                <label><span data-i18n="fieldEnd"></span>
                    <select name="final">
                        <?php for ($hour = $opening + 1; $hour <= $closing; $hour++): ?>
                        <option value="<?= sprintf('%02d:00', $hour) ?>"><?= $e($clock($hour)) ?></option>
                        <?php endfor; ?>
                    </select>
                </label>
            </div>

            <div data-block-field="day" hidden>
                <label><span data-i18n="fieldWhichDay"></span>
                    <input name="dayDate" type="date" min="<?= $today ?>">
                </label>
            </div>

            <div class="row two" data-block-field="range" hidden>
                <label><span data-i18n="fieldFirstDay"></span>
                    <input name="fromDate" type="date" min="<?= $today ?>">
                </label>
                <label><span data-i18n="fieldLastDay"></span>
                    <input name="toDate" type="date" min="<?= $today ?>">
                </label>
            </div>

            <p class="sheet-free" id="block-free"></p>
            <div class="sheet-actions">
                <button type="button" class="ghost" data-close-sheet data-i18n="cancel"></button>
                <button type="submit" class="primary" id="block-submit"></button>
            </div>
        </form>
    </dialog>

    <!-- ───────── Free blocked time ───────── -->
    <dialog class="sheet" id="sheet-free">
        <div class="sheet-grip" aria-hidden="true"></div>
        <form class="sheet-body" id="free-form">
            <h2 data-i18n="freeTitle"></h2>
            <p class="sheet-sub" data-i18n="freeIntro"></p>

            <div class="segmented" role="tablist" data-i18n-label="freeHowMuch">
                <button type="button" role="tab" aria-selected="true" data-free-mode="hours" data-i18n="blockModeHours"></button>
                <button type="button" role="tab" aria-selected="false" data-free-mode="day" data-i18n="blockModeDay"></button>
                <button type="button" role="tab" aria-selected="false" data-free-mode="range" data-i18n="blockModeRange"></button>
            </div>

            <div class="row" data-free-field="hours">
                <label><span data-i18n="fieldDate"></span>
                    <input name="date" type="date" min="<?= $today ?>">
                </label>
                <label><span data-i18n="fieldStart"></span>
                    <select name="time">
                        <?php for ($hour = $opening; $hour < $closing; $hour++): ?>
                        <option value="<?= sprintf('%02d:00', $hour) ?>"><?= $e($clock($hour)) ?></option>
                        <?php endfor; ?>
                    </select>
                </label>
                <label><span data-i18n="fieldEnd"></span>
                    <select name="final">
                        <?php for ($hour = $opening + 1; $hour <= $closing; $hour++): ?>
                        <option value="<?= sprintf('%02d:00', $hour) ?>"<?= $hour === $closing ? ' selected' : '' ?>><?= $e($clock($hour)) ?></option>
                        <?php endfor; ?>
                    </select>
                </label>
            </div>

            <div data-free-field="day" hidden>
                <label><span data-i18n="fieldWhichDay"></span>
                    <input name="dayDate" type="date" min="<?= $today ?>">
                </label>
            </div>

            <div class="row two" data-free-field="range" hidden>
                <label><span data-i18n="fieldFirstDay"></span>
                    <input name="fromDate" type="date" min="<?= $today ?>">
                </label>
                <label><span data-i18n="fieldLastDay"></span>
                    <input name="toDate" type="date" min="<?= $today ?>">
                </label>
            </div>

            <p class="sheet-free" id="free-preview"></p>
            <div class="sheet-actions">
                <button type="button" class="ghost" data-close-sheet data-i18n="cancel"></button>
                <button type="submit" class="primary" id="free-submit"></button>
            </div>
        </form>
    </dialog>

    <!-- ───────── Weekly booking hours ───────── -->
    <dialog class="sheet" id="sheet-hours">
        <div class="sheet-grip" aria-hidden="true"></div>
        <form class="sheet-body" id="hours-form">
            <h2 data-i18n="hoursTitle"></h2>
            <p class="sheet-sub" data-i18n="hoursIntro"></p>

            <div class="segmented" role="tablist" data-i18n-label="hoursHowMuch">
                <button type="button" role="tab" aria-selected="true" data-hours-mode="hours" data-i18n="blockModeHours"></button>
                <button type="button" role="tab" aria-selected="false" data-hours-mode="day" data-i18n="blockModeDay"></button>
                <button type="button" role="tab" aria-selected="false" data-hours-mode="range" data-i18n="blockModeRange"></button>
            </div>

            <div class="row" data-hours-field="hours">
                <label><span data-i18n="fieldDate"></span>
                    <input name="date" type="date" min="<?= $today ?>">
                </label>
                <label><span data-i18n="fieldStart"></span>
                    <select name="time">
                        <?php for ($hour = $opening; $hour < $closing; $hour++): ?>
                        <option value="<?= sprintf('%02d:00', $hour) ?>"><?= $e($clock($hour)) ?></option>
                        <?php endfor; ?>
                    </select>
                </label>
                <label><span data-i18n="fieldEnd"></span>
                    <select name="final">
                        <?php for ($hour = $opening + 1; $hour <= $closing; $hour++): ?>
                        <option value="<?= sprintf('%02d:00', $hour) ?>"<?= $hour === $closing ? ' selected' : '' ?>><?= $e($clock($hour)) ?></option>
                        <?php endfor; ?>
                    </select>
                </label>
            </div>

            <div data-hours-field="day" hidden>
                <label><span data-i18n="fieldWhichDay"></span>
                    <input name="dayDate" type="date" min="<?= $today ?>">
                </label>
            </div>

            <div class="row two" data-hours-field="range" hidden>
                <label><span data-i18n="fieldFirstDay"></span>
                    <input name="fromDate" type="date" min="<?= $today ?>">
                </label>
                <label><span data-i18n="fieldLastDay"></span>
                    <input name="toDate" type="date" min="<?= $today ?>">
                </label>
            </div>

            <p class="sheet-free" id="hours-preview"></p>
            <div class="sheet-actions">
                <button type="button" class="ghost" data-close-sheet data-i18n="cancel"></button>
                <button type="submit" class="primary" id="hours-submit" data-i18n="hoursSave"></button>
            </div>
        </form>
    </dialog>

    <!-- ───────── Website visits ───────── -->
    <dialog class="sheet" id="sheet-visits">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="sheet-body">
            <h2 data-i18n="visitsTitle"></h2>
            <p class="sheet-sub" data-i18n="visitsIntro"></p>
            <div class="visit-figures">
                <div class="visit-figure"><strong id="visits-today">—</strong><span data-i18n="visitsToday"></span></div>
                <div class="visit-figure"><strong id="visits-week">—</strong><span data-i18n="visitsWeek"></span></div>
                <div class="visit-figure"><strong id="visits-month">—</strong><span data-i18n="visitsMonth"></span></div>
            </div>
            <p class="visit-total" id="visits-total"></p>
            <div class="visit-chart" id="visits-chart" role="img"></div>
            <h3 class="visit-heading" data-i18n="visitsPages"></h3>
            <ul class="visit-pages" id="visits-pages"></ul>
            <p class="sheet-free" id="visits-note"></p>
            <div class="sheet-actions">
                <button type="button" class="primary" data-close-sheet data-i18n="close"></button>
            </div>
        </div>
    </dialog>

    <!-- ───────── Add sheet ───────── -->
    <dialog class="sheet" id="sheet-add">
        <div class="sheet-grip" aria-hidden="true"></div>
        <form class="sheet-body" id="add-form">
            <h2 data-i18n="phoneBookingTitle"></h2>
            <p class="sheet-sub" data-i18n="phoneBookingIntro"></p>
            <label><span data-i18n="fieldCustomer"></span>
                <input name="name" type="text" maxlength="150" required autocomplete="off" data-i18n-placeholder="placeholderFullName">
            </label>
            <label><span data-i18n="fieldPhone"></span> <span class="opt" data-i18n="optional"></span>
                <input name="phone" type="tel" maxlength="40" autocomplete="off" placeholder="+1 555 000 0000">
            </label>
            <label><span data-i18n="fieldEmail"></span> <span class="opt" data-i18n="optional"></span>
                <input name="email" type="email" maxlength="254" autocomplete="off" placeholder="nombre@ejemplo.com">
            </label>
            <div class="row">
                <label><span data-i18n="fieldDate"></span>
                    <input name="date" type="date" min="<?= $today ?>" required>
                </label>
                <label><span data-i18n="fieldStart"></span>
                    <select name="time" required>
                        <?php for ($hour = $opening; $hour < $closing; $hour++): ?>
                        <option value="<?= sprintf('%02d:00', $hour) ?>"><?= $e($clock($hour)) ?></option>
                        <?php endfor; ?>
                    </select>
                </label>
                <label><span data-i18n="fieldHours"></span>
                    <input name="hours" type="number" min="1" max="<?= $closing - $opening ?>" step="1" value="1" required inputmode="numeric">
                </label>
            </div>
            <label><span data-i18n="fieldNote"></span> <span class="opt" data-i18n="optional"></span>
                <textarea name="note" maxlength="500" rows="2" data-i18n-placeholder="placeholderNote"></textarea>
            </label>
            <p class="sheet-free" id="add-free"></p>
            <div class="sheet-actions">
                <button type="button" class="ghost" data-close-sheet data-i18n="cancel"></button>
                <button type="submit" class="primary" data-i18n="addBooking"></button>
            </div>
        </form>
    </dialog>

    <!-- ───────── Reschedule sheet ───────── -->
    <dialog class="sheet" id="sheet-move">
        <div class="sheet-grip" aria-hidden="true"></div>
        <form class="sheet-body" id="move-form">
            <h2 data-i18n="moveTitle"></h2>
            <p class="sheet-sub" id="move-who">—</p>
            <p class="sheet-sub" data-i18n="moveNote"></p>
            <div class="row">
                <label><span data-i18n="fieldNewDate"></span>
                    <input name="date" type="date" min="<?= $today ?>" required>
                </label>
                <label><span data-i18n="fieldStart"></span>
                    <select name="time" required>
                        <?php for ($hour = $opening; $hour < $closing; $hour++): ?>
                        <option value="<?= sprintf('%02d:00', $hour) ?>"><?= $e($clock($hour)) ?></option>
                        <?php endfor; ?>
                    </select>
                </label>
                <label><span data-i18n="fieldHours"></span>
                    <input name="hours" type="number" min="1" max="<?= $closing - $opening ?>" step="1" value="1" required inputmode="numeric">
                </label>
            </div>
            <p class="sheet-free" id="move-free"></p>
            <div class="sheet-actions">
                <button type="button" class="ghost" data-close-sheet data-i18n="keepAsIs"></button>
                <button type="submit" class="primary" data-i18n="moveSubmit"></button>
            </div>
        </form>
    </dialog>

    <!-- ───────── Cancel confirm ───────── -->
    <dialog class="sheet" id="sheet-cancel">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="sheet-body">
            <h2 id="cancel-title"></h2>
            <p class="sheet-sub" id="cancel-who">—</p>
            <p class="sheet-sub" id="cancel-explain"></p>
            <div class="sheet-actions">
                <button type="button" class="ghost" data-close-sheet id="cancel-keep"></button>
                <button type="button" class="danger" id="cancel-confirm"></button>
            </div>
        </div>
    </dialog>

    <!-- ───────── Session expired ───────── -->
    <dialog class="sheet" id="sheet-session">
        <div class="sheet-body">
            <h2 data-i18n="sessionTitle"></h2>
            <p class="sheet-sub" data-i18n="sessionIntro"></p>
            <form method="post" class="sheet-signin">
                <input type="hidden" name="token" value="<?= $token ?>">
                <label><span data-i18n="passwordLabel"></span>
                    <input type="password" name="password" autocomplete="current-password" required maxlength="1024" autocapitalize="off" autocorrect="off" spellcheck="false">
                </label>
                <button type="submit" class="primary" data-i18n="signIn"></button>
            </form>
        </div>
    </dialog>

</div>
<?php endif; ?>
</body>
</html>
