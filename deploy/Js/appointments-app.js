/* Appointments — installable owner app.
   Reads and writes the same records as /manage-appointments.php through
   /api/appointments-admin.php, so website availability stays in step.
   All scheduling is Mountain Time, whatever the phone's own time zone is. */
(() => {
    'use strict';

    const ZONE = 'America/Denver';
    const API = '/api/appointments-admin.php';
    const CSRF = document.querySelector('meta[name="csrf-token"]').content;
    const OPEN_HOUR = Number(document.querySelector('meta[name="app-opening-hour"]').content) || 9;
    const CLOSE_HOUR = Number(document.querySelector('meta[name="app-closing-hour"]').content) || 18;
    const POLL_MS = 15000;

    /* ── language ────────────────────────────────────────────────────
       Spanish by default. The whole interface is keyed, so the toggle
       swaps every string in place without reloading the page. */
    const STRINGS = {
        en: {
            refresh: 'Refresh', signOut: 'Sign out', addToCalendar: 'Add to the calendar',
            sections: 'Sections', calendarRange: 'Calendar range', filterByStatus: 'Filter by status',
            quickLabels: 'Quick labels', blockHowMuch: 'How much to block',
            tabToday: 'Today', tabCalendar: 'Calendar', tabRequests: 'Requests', tabAll: 'All',
            titleTodayEyebrow: 'Appointments', titleToday: 'Today',
            titleCalendarEyebrow: 'Schedule', titleCalendar: 'Calendar',
            titleRequestsEyebrow: 'Waiting for you', titleRequests: 'Requests',
            titleAllEyebrow: 'Everything', titleAll: 'All bookings',
            statToday: 'today', statPending: 'pending', statWeek: 'this week',
            quickPhone: 'Phone booking', quickBlock: 'Block hours', quickDaysOff: 'Days off', quickApprove: 'Approve requests',
            quickFree: 'Open time up', addFreeTime: 'Open blocked time back up',
            freeTitle: 'Open time back up', freeHowMuch: 'How much to open up',
            freeIntro: 'This removes time you blocked, so the website offers those hours again. Customer appointments are never touched — only your own blocks.',
            freeSubmitHours: 'Open these hours', freeSubmitDay: 'Open the day', freeSubmitRange: 'Open these days',
            freeNothing: 'Nothing of yours is blocked there.',
            freeWillOpen: 'Will open {hours} back up.',
            freeWillOpenSpan: 'Will open {hours} back up, {from} to {to}.',
            freeWillOpenDays: 'Will open {hours} back up across {days}.',
            freeKeepsRest: ' The rest of that block stays blocked.',
            freeKept: ' {n} stay booked and are left alone.',
            freePast: 'Those hours have already passed today.',
            endBeforeStart: 'The end has to be later than the start.',
            quickHours: 'Website hours', addWeeklyHours: 'Open hours on the website',
            hoursTitle: 'Hours the website offers',
            hoursIntro: 'Sets the hours customers can book on a day, whatever the usual schedule for that weekday says. Hours outside this stay yours: you can still add a booking by phone at any time.',
            hoursHowMuch: 'How much to open',
            hoursSave: 'Open these hours', hoursSaveDay: 'Open the whole day', hoursSaveRange: 'Open these days',
            hoursWillOpen: 'The website will take bookings {from} to {to} on {day}.',
            hoursWillOpenDays: 'The website will take bookings {from} to {to} on {days}.',
            hoursNormally: ' Normally {normal}.',
            hoursNormallyClosed: ' Normally closed.',
            hoursSameAsUsual: 'Those are already the usual hours for {day}, so nothing changes.',
            hoursAtMost90: 'Ninety days at a time is the most I can set.',
            hoursPastPart: ' The hours of today that have gone by cannot be offered, so the website starts at {from}.',
            hoursUnavailable: 'The website hours could not be read. Try again in a moment.',
            toastHoursSaving: 'Opening up…', toastHoursSaved: 'Done. The website is offering those hours.',
            toastFreeing: 'Opening up…', toastOpened: 'Opened {hours} back up.',
            toastNothingOpened: 'Nothing was opened up.',
            todaySchedule: 'Today’s schedule', nextUp: 'Next up',
            rangeDay: 'Day', rangeWeek: 'Week', rangeMonth: 'Month',
            previous: 'Previous', next: 'Next', jumpToday: 'Jump to today',
            requestsIntro: 'A request already holds its hours, so no one else can take them while you decide. Confirming keeps them and emails the customer; cancelling releases them.',
            searchPlaceholder: 'Search name, phone or email',
            filterAll: 'All', filterPending: 'Pending', filterConfirmed: 'Confirmed', filterCancelled: 'Cancelled',
            detailWarn: 'The alert email to you was not confirmed as delivered, so this request may not have reached your inbox. Check it with the customer before confirming.',
            detailNote: 'Confirming and cancelling update availability at once, and the website queues the customer’s email itself. Moving an appointment does not email anyone — tell the customer yourself.',
            addTitle: 'Add to the calendar', addPhoneBooking: 'Booking taken by phone',
            addBlockHours: 'Block some hours', addDayOff: 'A day off', addDaysOff: 'Several days off',
            cancel: 'Cancel',
            blockTitle: 'Block time',
            blockIntro: 'Blocked time stops the website offering those hours. Only hours that are still free get blocked, and you can free them again whenever you like.',
            blockModeHours: 'Hours', blockModeDay: 'A day', blockModeRange: 'Days off',
            fieldLabel: 'Label', onlyYouSee: 'only you see this',
            presetUnavailable: 'Unavailable', presetDayOff: 'Day off',
            presetRegular: 'Held for a regular client', presetRegularShort: 'Regular client',
            presetPersonal: 'Personal', presetLunch: 'Lunch',
            fieldDate: 'Date', fieldStart: 'Start', fieldHours: 'Hours', fieldEnd: 'End',
            fieldWhichDay: 'Which day', fieldFirstDay: 'First day off', fieldLastDay: 'Last day off',
            fieldNewDate: 'New date', fieldCustomer: 'Customer name', fieldPhone: 'Phone',
            fieldEmail: 'Email', fieldNote: 'Note', optional: 'optional',
            placeholderFullName: 'Full name', placeholderNote: 'Treatment requested, anything to remember',
            phoneBookingTitle: 'Phone booking', phoneBookingIntro: 'Added as confirmed. It blocks its hours straight away.',
            addBooking: 'Add booking',
            moveTitle: 'Move appointment',
            moveNote: 'The customer keeps their details and treatments, and the old hours go back on the website. No email is sent about a move, so tell them yourself.',
            keepAsIs: 'Keep as is', moveSubmit: 'Move appointment',
            sessionTitle: 'Session expired', sessionIntro: 'Sign in again to keep managing appointments.',
            passwordLabel: 'Manager password', signIn: 'Sign in',
            blockSubmitHours: 'Block these hours', blockSubmitDay: 'Block the day', blockSubmitRange: 'Block these days',
            today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday',
            statusPending: 'pending', statusConfirmed: 'confirmed', statusCancelled: 'cancelled', statusBlocked: 'blocked', statusExpired: 'finished',
            factClosed: 'Closed', closedAutomatically: 'Closed automatically once its time passed',
            open: 'Open', blockVerb: 'Block', blockHourLabel: 'Block {hour} on {day}',
            nextToday: 'Next today', nextOn: 'Next · {day}', scheduleLabel: 'Schedule',
            nothingBooked: 'Nothing booked', nothingUpcoming: 'No upcoming appointments on the books.',
            heroDetail: '{span} · {state}', pendingApproval: 'Pending your approval', confirmedWord: 'Confirmed',
            nothingAfterToday: 'Nothing scheduled after today.',
            appointmentsThisDay: 'Appointments this day', noneThisDay: 'No appointments on this day.',
            booked: '{n} booked', openDay: 'open',
            monthCount: '{n} this month',
            noRequests: 'No requests waiting. New website requests appear here.',
            expiredRequests: 'Expired requests', noMatches: 'Nothing matches this filter.',
            blockedTime: 'Time you blocked', bookedByPhone: 'Booked by phone', websiteRequest: 'Website request',
            yourAlertUnconfirmed: 'Your alert unconfirmed',
            factServices: 'Services', factLength: 'Length', factLocation: 'Location', factPhone: 'Phone',
            factEmail: 'Email', factNote: 'Note', factMovedFrom: 'Moved from', factLanguage: 'Language',
            factEmails: 'Emails', factKind: 'Kind', notSet: 'Not set', spanishWord: 'Spanish',
            kindBlock: 'Time you blocked — no customer attached', kindManual: 'Added by phone', kindWebsite: 'Website request',
            mailQueued: 'queued', mailSent: 'sent', mailCancelled: 'cancelled', mailSkipped: 'not sent',
            mailPreview: 'local test, not sent', mailPending: 'pending',
            mailReceipt: 'Receipt {state}', mailConfirmation: 'Confirmation {state}',
            mailReminder: 'Day-before reminder {state}', mailWaits: 'waits for confirming',
            mailNeedsAttention: 'delivery needs attention, a retry is scheduled',
            noEmailOnFile: 'No email address on file', nothingQueued: 'Nothing queued yet',
            actionConfirm: 'Confirm appointment', actionMove: 'Move to another time', actionMoveBlock: 'Move this block',
            actionCancel: 'Cancel appointment', actionFree: 'Free these hours',
            actionCall: 'Call customer', actionEmail: 'Email customer',
            cancelTitleBooking: 'Cancel this appointment?', cancelTitleBlock: 'Free these hours?',
            cancelExplainBooking: 'The record stays in your history marked Cancelled, and its hours become available on the website again.',
            cancelExplainBlock: 'The website will offer these hours to customers again straight away.',
            cancelKeepBooking: 'Keep appointment', cancelKeepBlock: 'Keep it blocked',
            toastSaving: 'Saving…', toastBlocking: 'Blocking…',
            toastConfirmed: 'Confirmed. The hours stay reserved and the customer email is queued.',
            toastCancelled: 'Cancelled. The hours are free again and the customer is told.',
            toastFreed: 'Freed. The website is offering those hours again.',
            toastMoved: 'Moved. The old hours are free again — remember to tell the customer.',
            toastAdded: 'Booking added. Its hours are blocked on the website.',
            toastBlocked: 'Blocked {hours}.', toastRefused: ' {n} was taken in the meantime.',
            toastNothingBlocked: 'Nothing was blocked.',
            errOffline: 'No connection. Nothing was changed.',
            errGeneric: 'That could not be saved. Pull to refresh and try again.',
            errSignIn: 'Please sign in again.',
            offlineBanner: 'Offline — showing the last loaded schedule.',
            pickDate: 'Pick a date.', pickDay: 'Pick a day.', pickRange: 'Pick the first and last day off.',
            datePassed: 'That date has already passed.', dayPassed: 'That day has already passed.',
            firstDayPassed: 'The first day has already passed.', lastBeforeFirst: 'The last day is before the first.',
            atMost90: 'Block at most 90 days at a time.',
            runsPast: 'That runs past {hour}.', alreadyTaken: '{hour} is already taken on {day}.',
            nothingFree: 'Nothing free left to block there.',
            willBlockDays: 'Will block {hours} across {days}. Anything already booked is left alone.',
            willBlock: 'Will block {hours}.',
            noFreeBlock: 'No free {hours}-hour block on {day}.', freeOn: 'Free on {day}: {list}'
        },
        es: {
            refresh: 'Actualizar', signOut: 'Cerrar sesión', addToCalendar: 'Añadir al calendario',
            sections: 'Secciones', calendarRange: 'Vista del calendario', filterByStatus: 'Filtrar por estado',
            quickLabels: 'Etiquetas rápidas', blockHowMuch: 'Cuánto bloquear',
            tabToday: 'Hoy', tabCalendar: 'Calendario', tabRequests: 'Solicitudes', tabAll: 'Todas',
            titleTodayEyebrow: 'Citas', titleToday: 'Hoy',
            titleCalendarEyebrow: 'Agenda', titleCalendar: 'Calendario',
            titleRequestsEyebrow: 'Te esperan', titleRequests: 'Solicitudes',
            titleAllEyebrow: 'Todo', titleAll: 'Todas las citas',
            statToday: 'hoy', statPending: 'pendientes', statWeek: 'esta semana',
            quickPhone: 'Cita por teléfono', quickBlock: 'Bloquear horas', quickDaysOff: 'Días libres', quickApprove: 'Aprobar solicitudes',
            quickFree: 'Abrir horas', addFreeTime: 'Volver a abrir tiempo bloqueado',
            freeTitle: 'Volver a abrir tiempo', freeHowMuch: 'Cuánto abrir',
            freeIntro: 'Quita el tiempo que bloqueaste, así la web vuelve a ofrecer esas horas. Las citas de clientas no se tocan: solo se quitan tus bloqueos.',
            freeSubmitHours: 'Abrir estas horas', freeSubmitDay: 'Abrir el día', freeSubmitRange: 'Abrir estos días',
            freeNothing: 'No tienes nada bloqueado ahí.',
            freeWillOpen: 'Se abrirán {hours}.',
            freeWillOpenSpan: 'Se abrirán {hours}, de {from} a {to}.',
            freeWillOpenDays: 'Se abrirán {hours} en {days}.',
            freeKeepsRest: ' El resto de ese bloqueo sigue bloqueado.',
            freeKept: ' {n} siguen reservadas y no se tocan.',
            freePast: 'Esas horas ya pasaron hoy.',
            endBeforeStart: 'La hora final tiene que ser después de la inicial.',
            quickHours: 'Horario de la web', addWeeklyHours: 'Abrir horas en la web',
            hoursTitle: 'Horas que ofrece la web',
            hoursIntro: 'Pone las horas que las clientas pueden reservar ese día, sin importar lo que diga el horario normal de ese día de la semana. Las horas fuera de esto siguen siendo tuyas: siempre puedes añadir una cita por teléfono.',
            hoursHowMuch: 'Cuánto abrir',
            hoursSave: 'Abrir estas horas', hoursSaveDay: 'Abrir el día entero', hoursSaveRange: 'Abrir estos días',
            hoursWillOpen: 'La web aceptará reservas de {from} a {to} el {day}.',
            hoursWillOpenDays: 'La web aceptará reservas de {from} a {to} en {days}.',
            hoursNormally: ' Normalmente {normal}.',
            hoursNormallyClosed: ' Normalmente cerrado.',
            hoursSameAsUsual: 'Esas ya son las horas normales del {day}, así que no cambia nada.',
            hoursAtMost90: 'Noventa días a la vez es lo máximo que puedo poner.',
            hoursPastPart: ' Las horas de hoy que ya pasaron no se pueden ofrecer, así que la web empieza a las {from}.',
            hoursUnavailable: 'No se pudo leer el horario de la web. Inténtalo otra vez en un momento.',
            toastHoursSaving: 'Abriendo…', toastHoursSaved: 'Listo. La web ya ofrece esas horas.',
            toastFreeing: 'Abriendo…', toastOpened: 'Se abrieron {hours}.',
            toastNothingOpened: 'No se abrió nada.',
            todaySchedule: 'Agenda de hoy', nextUp: 'Próximas',
            rangeDay: 'Día', rangeWeek: 'Semana', rangeMonth: 'Mes',
            previous: 'Anterior', next: 'Siguiente', jumpToday: 'Ir a hoy',
            requestsIntro: 'Una solicitud ya reserva sus horas, así que nadie más puede tomarlas mientras decides. Al confirmar se mantienen y se envía el correo a la clienta; al cancelar se liberan.',
            searchPlaceholder: 'Busca por nombre, teléfono o correo',
            filterAll: 'Todas', filterPending: 'Pendientes', filterConfirmed: 'Confirmadas', filterCancelled: 'Canceladas',
            detailWarn: 'No se confirmó la entrega del correo de aviso, así que esta solicitud podría no haber llegado a tu bandeja. Confírmala con la clienta antes de aceptarla.',
            detailNote: 'Confirmar y cancelar actualizan la disponibilidad al instante, y la web se encarga del correo a la clienta. Cambiar la hora no envía ningún correo: avísale tú.',
            addTitle: 'Añadir al calendario', addPhoneBooking: 'Cita tomada por teléfono',
            addBlockHours: 'Bloquear unas horas', addDayOff: 'Un día libre', addDaysOff: 'Varios días libres',
            cancel: 'Cancelar',
            blockTitle: 'Bloquear tiempo',
            blockIntro: 'El tiempo bloqueado deja de ofrecerse en la web. Solo se bloquean las horas que siguen libres, y puedes liberarlas cuando quieras.',
            blockModeHours: 'Horas', blockModeDay: 'Un día', blockModeRange: 'Días libres',
            fieldLabel: 'Etiqueta', onlyYouSee: 'solo la ves tú',
            presetUnavailable: 'No disponible', presetDayOff: 'Día libre',
            presetRegular: 'Reservado para clienta habitual', presetRegularShort: 'Clienta habitual',
            presetPersonal: 'Personal', presetLunch: 'Comida',
            fieldDate: 'Fecha', fieldStart: 'Inicio', fieldHours: 'Horas', fieldEnd: 'Final',
            fieldWhichDay: 'Qué día', fieldFirstDay: 'Primer día libre', fieldLastDay: 'Último día libre',
            fieldNewDate: 'Nueva fecha', fieldCustomer: 'Nombre de la clienta', fieldPhone: 'Teléfono',
            fieldEmail: 'Correo', fieldNote: 'Nota', optional: 'opcional',
            placeholderFullName: 'Nombre completo', placeholderNote: 'Tratamiento pedido, algo que recordar',
            phoneBookingTitle: 'Cita por teléfono', phoneBookingIntro: 'Se añade como confirmada y bloquea sus horas de inmediato.',
            addBooking: 'Añadir cita',
            moveTitle: 'Cambiar la hora',
            moveNote: 'La clienta conserva sus datos y tratamientos, y las horas anteriores vuelven a la web. No se envía ningún correo por el cambio, así que avísale tú.',
            keepAsIs: 'Dejar como está', moveSubmit: 'Cambiar la cita',
            sessionTitle: 'La sesión caducó', sessionIntro: 'Entra de nuevo para seguir gestionando las citas.',
            passwordLabel: 'Contraseña', signIn: 'Entrar',
            blockSubmitHours: 'Bloquear estas horas', blockSubmitDay: 'Bloquear el día', blockSubmitRange: 'Bloquear estos días',
            today: 'Hoy', tomorrow: 'Mañana', yesterday: 'Ayer',
            statusPending: 'pendiente', statusConfirmed: 'confirmada', statusCancelled: 'cancelada', statusBlocked: 'bloqueada', statusExpired: 'terminada',
            factClosed: 'Cierre', closedAutomatically: 'Cerrada automáticamente al pasar su hora',
            open: 'Libre', blockVerb: 'Bloquear', blockHourLabel: 'Bloquear las {hour} del {day}',
            nextToday: 'Siguiente hoy', nextOn: 'Siguiente · {day}', scheduleLabel: 'Agenda',
            nothingBooked: 'Nada reservado', nothingUpcoming: 'No hay citas próximas en la agenda.',
            heroDetail: '{span} · {state}', pendingApproval: 'Pendiente de tu aprobación', confirmedWord: 'Confirmada',
            nothingAfterToday: 'Nada programado después de hoy.',
            appointmentsThisDay: 'Citas de este día', noneThisDay: 'No hay citas este día.',
            booked: '{n} reservadas', openDay: 'libre',
            monthCount: '{n} este mes',
            noRequests: 'No hay solicitudes esperando. Las nuevas solicitudes de la web aparecen aquí.',
            expiredRequests: 'Solicitudes vencidas', noMatches: 'Nada coincide con este filtro.',
            blockedTime: 'Tiempo que bloqueaste', bookedByPhone: 'Reservada por teléfono', websiteRequest: 'Solicitud de la web',
            yourAlertUnconfirmed: 'Aviso sin confirmar',
            factServices: 'Servicios', factLength: 'Duración', factLocation: 'Ubicación', factPhone: 'Teléfono',
            factEmail: 'Correo', factNote: 'Nota', factMovedFrom: 'Antes el', factLanguage: 'Idioma',
            factEmails: 'Correos', factKind: 'Tipo', notSet: 'Sin definir', spanishWord: 'Español',
            kindBlock: 'Tiempo que bloqueaste, sin clienta', kindManual: 'Añadida por teléfono', kindWebsite: 'Solicitud de la web',
            mailQueued: 'en cola', mailSent: 'enviado', mailCancelled: 'cancelado', mailSkipped: 'no enviado',
            mailPreview: 'prueba local, sin enviar', mailPending: 'pendiente',
            mailReceipt: 'Acuse {state}', mailConfirmation: 'Confirmación {state}',
            mailReminder: 'Recordatorio del día antes {state}', mailWaits: 'espera a que confirmes',
            mailNeedsAttention: 'la entrega necesita atención, hay un reintento programado',
            noEmailOnFile: 'Sin correo registrado', nothingQueued: 'Nada en cola todavía',
            actionConfirm: 'Confirmar cita', actionMove: 'Cambiar la hora', actionMoveBlock: 'Mover este bloqueo',
            actionCancel: 'Cancelar cita', actionFree: 'Liberar estas horas',
            actionCall: 'Llamar a la clienta', actionEmail: 'Escribir a la clienta',
            cancelTitleBooking: '¿Cancelar esta cita?', cancelTitleBlock: '¿Liberar estas horas?',
            cancelExplainBooking: 'El registro queda en tu historial como cancelada, y sus horas vuelven a estar disponibles en la web.',
            cancelExplainBlock: 'La web volverá a ofrecer estas horas a las clientas de inmediato.',
            cancelKeepBooking: 'Conservar la cita', cancelKeepBlock: 'Dejarlo bloqueado',
            toastSaving: 'Guardando…', toastBlocking: 'Bloqueando…',
            toastConfirmed: 'Confirmada. Las horas siguen reservadas y el correo a la clienta está en cola.',
            toastCancelled: 'Cancelada. Las horas vuelven a estar libres y se avisa a la clienta.',
            toastFreed: 'Liberadas. La web ya vuelve a ofrecer esas horas.',
            toastMoved: 'Cambiada. Las horas anteriores quedan libres: recuerda avisar a la clienta.',
            toastAdded: 'Cita añadida. Sus horas quedan bloqueadas en la web.',
            toastBlocked: 'Bloqueaste {hours}.', toastRefused: ' {n} se ocupó mientras tanto.',
            toastNothingBlocked: 'No se bloqueó nada.',
            errOffline: 'Sin conexión. No se cambió nada.',
            errGeneric: 'No se pudo guardar. Actualiza e inténtalo de nuevo.',
            errSignIn: 'Entra de nuevo, por favor.',
            offlineBanner: 'Sin conexión: se muestra la última agenda cargada.',
            pickDate: 'Elige una fecha.', pickDay: 'Elige un día.', pickRange: 'Elige el primer y el último día libre.',
            datePassed: 'Esa fecha ya pasó.', dayPassed: 'Ese día ya pasó.',
            firstDayPassed: 'El primer día ya pasó.', lastBeforeFirst: 'El último día es anterior al primero.',
            atMost90: 'Bloquea como máximo 90 días a la vez.',
            runsPast: 'Eso pasa de las {hour}.', alreadyTaken: 'Las {hour} del {day} ya están ocupadas.',
            nothingFree: 'No queda nada libre que bloquear ahí.',
            willBlockDays: 'Se bloquearán {hours} en {days}. Lo ya reservado se respeta.',
            willBlock: 'Se bloquearán {hours}.',
            noFreeBlock: 'No hay un hueco libre de {hours} horas el {day}.', freeOn: 'Libre el {day}: {list}'
        }
    };

    const WORDS = {
        en: { hour: ['hour', 'hours'], day: ['day', 'days'], stretch: ['stretch', 'stretches'], appointment: ['appointment', 'appointments'] },
        es: { hour: ['hora', 'horas'], day: ['día', 'días'], stretch: ['franja', 'franjas'], appointment: ['cita', 'citas'] }
    };

    let LANG = document.documentElement.lang === 'en' ? 'en' : 'es';
    const LOCALES = { en: 'en-US', es: 'es-MX' };

    function t(key, vars) {
        let text = (STRINGS[LANG] && STRINGS[LANG][key]) || STRINGS.en[key] || key;
        if (vars) for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(vars[name]);
        return text;
    }

    /** Fills every element the page marked with a translation key. */
    function applyStaticStrings() {
        document.documentElement.lang = LANG;
        document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
        document.querySelectorAll('[data-i18n-label]').forEach((node) => { node.setAttribute('aria-label', t(node.dataset.i18nLabel)); });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
        const toggle = document.querySelector('#lang-label');
        if (toggle) toggle.textContent = LANG === 'es' ? 'EN' : 'ES';
    }

    /* ── tiny DOM helper ─────────────────────────────────────────── */
    function el(tag, props, ...kids) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(props || {})) {
            if (value === null || value === undefined || value === false) continue;
            if (key === 'class') node.className = value;
            else if (key === 'text') node.textContent = value;
            else if (key === 'on') for (const [type, fn] of Object.entries(value)) node.addEventListener(type, fn);
            else if (key.startsWith('data-') || key === 'href' || key === 'hidden') node.setAttribute(key, value === true ? '' : value);
            else node[key] = value;
        }
        for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
        return node;
    }
    const $ = (selector) => document.querySelector(selector);

    // replaceChildren takes nodes as separate arguments, so arrays and empty
    // slots are flattened away here rather than stringified into the page.
    function fill(node, ...kids) {
        node.replaceChildren(...kids.flat().filter((kid) => kid !== null && kid !== undefined && kid !== false));
    }

    /* ── dates, always as plain Mountain Time calendar days ──────── */
    const isoFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
    const todayISO = () => isoFormatter.format(new Date());
    const nowHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: '2-digit', hour12: false }).format(new Date()));
    const utcOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    const addDays = (iso, n) => new Date(utcOf(iso) + n * 86400000).toISOString().slice(0, 10);
    const weekdayOf = (iso) => new Date(utcOf(iso)).getUTCDay();
    const startOfWeek = (iso) => addDays(iso, -weekdayOf(iso));
    const label = (iso, options) => new Intl.DateTimeFormat(LOCALES[LANG], { timeZone: 'UTC', ...options }).format(new Date(utcOf(iso)));
    // Spanish uses a 24-hour clock, as the public booking calendar does.
    const hhmm = (time) => {
        const h = Number(time.slice(0, 2));
        return LANG === 'es' ? `${h}:00` : `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
    };
    const hourTick = (h) => (LANG === 'es' ? `${h}:00` : `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`);
    const span = (record) => `${hhmm(record.time)} – ${hhmm(record.endTime)}`;

    function relativeDay(iso) {
        const today = todayISO();
        if (iso === today) return t('today');
        if (iso === addDays(today, 1)) return t('tomorrow');
        if (iso === addDays(today, -1)) return t('yesterday');
        return label(iso, { weekday: 'short', month: 'short', day: 'numeric' });
    }

    /* ── state ───────────────────────────────────────────────────── */
    const state = {
        records: [],
        tab: 'today',
        range: 'day',
        cursor: todayISO(),
        status: 'all',
        query: '',
        selected: null,
        blockMode: 'hours',
        freeMode: 'hours',
        schedule: null,
        bounds: null,
        hoursMode: 'hours',
        busy: false,
        loaded: false
    };

    const byStart = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
    const active = () => state.records.filter((r) => r.status !== 'cancelled');
    const onDay = (iso, includeCancelled) => (includeCancelled ? state.records : active())
        .filter((r) => r.date === iso).sort(byStart);

    /* ── network ─────────────────────────────────────────────────── */
    async function call(body) {
        const today = todayISO();
        const url = body ? API : `${API}?${new URLSearchParams({ from: addDays(today, -120), to: addDays(today, 270) })}`;
        let response;
        try {
            response = await fetch(url, body
                ? { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF }, body: JSON.stringify(body) }
                : { credentials: 'same-origin', cache: 'no-store' });
        } catch {
            throw new Error('offline');
        }
        if (response.status === 401) { $('#sheet-session').showModal(); throw new Error(t('errSignIn')); }
        let result = {};
        try { result = await response.json(); } catch { /* fall through to the generic message */ }
        if (!response.ok || !result.ok) throw new Error(result.message || t('errGeneric'));
        return result;
    }

    let toastTimer;
    function toast(text, tone) {
        const node = $('#toast');
        node.textContent = text;
        node.hidden = !text;
        if (tone) node.dataset.tone = tone; else delete node.dataset.tone;
        clearTimeout(toastTimer);
        if (text) toastTimer = setTimeout(() => { node.hidden = true; }, 4200);
    }

    function connection(text) {
        const node = $('#connection');
        node.textContent = text;
        node.hidden = !text;
    }

    async function load(showSpinner) {
        const button = $('#refresh-button');
        if (showSpinner) button.classList.add('is-busy');
        try {
            const result = await call();
            state.records = result.appointments || [];
            // The weekly website hours travel with the listing; older responses
            // simply do not carry them.
            if (result.schedule) state.schedule = result.schedule;
            if (result.bounds) state.bounds = result.bounds;
            state.loaded = true;
            connection('');
            renderAll();
        } catch (error) {
            if (error.message === 'offline') connection(t('offlineBanner'));
            else if (error.message !== t('errSignIn')) connection(error.message);
        } finally {
            button.classList.remove('is-busy');
        }
    }

    async function mutate(body, success) {
        if (state.busy) return false;
        state.busy = true;
        document.querySelectorAll('.sheet button').forEach((b) => { b.disabled = true; });
        toast(t('toastSaving'));
        try {
            await call(body);
            await load(false);
            document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== 'sheet-session') d.close(); });
            toast(success);
            return true;
        } catch (error) {
            toast(error.message === 'offline' ? t('errOffline') : error.message, 'bad');
            return false;
        } finally {
            state.busy = false;
            document.querySelectorAll('.sheet button').forEach((b) => { b.disabled = false; });
        }
    }

    /* ── availability maths, mirroring the server's overlap rule ──── */
    // Pending requests hold their time just as confirmed ones do, matching the
    // server's own overlap rule — so an hour awaiting your approval is not free.
    const HOLDS_TIME = ['pending', 'confirmed'];

    function occupiedHours(iso, exceptId) {
        const taken = new Set();
        for (const record of state.records) {
            if (!HOLDS_TIME.includes(record.status) || record.date !== iso || record.id === exceptId) continue;
            for (let h = Number(record.time.slice(0, 2)); h < Number(record.endTime.slice(0, 2)); h += 1) taken.add(h);
        }
        return taken;
    }

    function freeStarts(iso, hours, exceptId) {
        const taken = occupiedHours(iso, exceptId);
        const today = todayISO();
        const cutoff = iso === today ? nowHour() : -1;
        const starts = [];
        for (let h = OPEN_HOUR; h + hours <= CLOSE_HOUR; h += 1) {
            if (h <= cutoff) continue;
            let fits = true;
            for (let k = h; k < h + hours; k += 1) if (taken.has(k)) { fits = false; break; }
            if (fits) starts.push(h);
        }
        return starts;
    }

    function writeFreeHint(target, form, exceptId) {
        const node = $(target);
        const iso = form.elements.date.value;
        const hours = Number(form.elements.hours.value) || 1;
        if (!iso) { node.textContent = ''; return; }
        if (iso < todayISO()) { node.textContent = t('datePassed'); return; }
        const starts = freeStarts(iso, hours, exceptId);
        if (!starts.length) { node.textContent = t('noFreeBlock', { hours, day: relativeDay(iso) }); return; }
        const shown = starts.slice(0, 6).map((h) => hhmm(`${String(h).padStart(2, '0')}:00`)).join(' · ');
        node.textContent = t('freeOn', { day: relativeDay(iso), list: shown + (starts.length > 6 ? ' …' : '') });
    }

    /* ── blocks ──────────────────────────────────────────────────────
       A block is held time — a day off, or hours kept back for a regular
       client. The server stores it as a confirmed manual record, so it
       occupies hours exactly like a booking; only the wording differs. */
    const isBlock = (record) => record.kind === 'block';
    const statusOf = (record) => {
        // Closed out by the server because its time passed, rather than cancelled
        // by anyone — worth telling apart at a glance.
        if (record.status === 'cancelled' && record.autoExpired) return 'expired';
        if (isBlock(record) && record.status === 'confirmed') return 'blocked';
        return record.status;
    };
    const statusWord = (record) => t('status' + statusOf(record).charAt(0).toUpperCase() + statusOf(record).slice(1));

    /** Contiguous stretches of still-free hours on a day, newest rules applied. */
    function freeRuns(iso) {
        const taken = occupiedHours(iso);
        const cutoff = iso === todayISO() ? nowHour() : -1;
        const runs = [];
        let start = null;
        for (let h = OPEN_HOUR; h < CLOSE_HOUR; h += 1) {
            const free = !taken.has(h) && h > cutoff;
            if (free && start === null) start = h;
            if (!free && start !== null) { runs.push({ date: iso, time: pad(start), hours: h - start }); start = null; }
        }
        if (start !== null) runs.push({ date: iso, time: pad(start), hours: CLOSE_HOUR - start });
        return runs;
    }

    const pad = (h) => `${String(h).padStart(2, '0')}:00`;
    const plural = (n, word) => `${n} ${WORDS[LANG][word][n === 1 ? 0 : 1]}`;

    /* ── cards ───────────────────────────────────────────────────── */
    function describe(record) {
        if (isBlock(record)) return t('blockedTime');
        if (record.services && record.services.length) {
            return record.services.map((s) => `${s.quantity} × ${s.title}`).join(', ');
        }
        return record.source === 'manual' ? t('bookedByPhone') : t('websiteRequest');
    }

    function card(record, options) {
        const showDay = !options || options.showDay !== false;
        return el('button', {
            type: 'button', class: 'card', 'data-id': record.id,
            on: { click: () => openDetail(record.id) }
        },
            el('div', { class: 'card-top' },
                el('span', { class: 'card-name', text: record.name }),
                el('span', { class: 'card-when', text: showDay ? `${relativeDay(record.date)} · ${hhmm(record.time)}` : span(record) })
            ),
            el('span', { class: 'card-meta', text: describe(record) }),
            el('div', { class: 'card-foot' },
                el('span', { class: 'status', 'data-status': statusOf(record), text: statusWord(record) }),
                record.source !== 'manual' && record.emailSent === false && record.status === 'pending'
                    ? el('span', { class: 'card-meta', text: t('yourAlertUnconfirmed') }) : null
            )
        );
    }

    const emptyBox = (text) => el('p', { class: 'empty', text });

    /* ── Today ───────────────────────────────────────────────────── */
    function renderToday() {
        const today = todayISO();
        const hour = nowHour();
        const todays = onDay(today);
        const pending = active().filter((r) => r.status === 'pending' && r.date >= today).sort(byStart);
        const weekEnd = addDays(startOfWeek(today), 6);
        const thisWeek = active().filter((r) => r.date >= startOfWeek(today) && r.date <= weekEnd);

        const next = active()
            .filter((r) => r.date > today || (r.date === today && Number(r.endTime.slice(0, 2)) > hour))
            .sort(byStart)[0];

        if (!state.loaded) {
            $('#hero-label').textContent = t('toastSaving');
            $('#hero-headline').textContent = '—';
        } else if (next) {
            const soon = next.date === today;
            $('#hero-label').textContent = soon ? t('nextToday') : t('nextOn', { day: relativeDay(next.date) });
            $('#hero-headline').textContent = next.name;
            $('#hero-detail').textContent = t('heroDetail', { span: span(next), state: next.status === 'pending' ? t('pendingApproval') : t('confirmedWord') });
        } else {
            $('#hero-label').textContent = t('scheduleLabel');
            $('#hero-headline').textContent = t('nothingBooked');
            $('#hero-detail').textContent = t('nothingUpcoming');
        }
        $('#stat-today').textContent = String(todays.length);
        $('#stat-pending').textContent = String(pending.length);
        $('#stat-week').textContent = String(thisWeek.length);

        fill($('#today-timeline'), timeline(today));

        const upcoming = active()
            .filter((r) => r.date > today)
            .sort(byStart)
            .slice(0, 6);
        fill($('#today-upcoming'),
            upcoming.length ? upcoming.map((r) => card(r)) : emptyBox(t('nothingAfterToday'))
        );

        const count = state.records.filter((r) => r.status === 'pending' && r.date >= today).length;
        const badge = $('#tab-badge');
        badge.textContent = String(count);
        badge.hidden = count === 0;
    }

    function timeline(iso) {
        const records = onDay(iso);
        const wrap = el('div', { class: 'timeline' });
        const placed = new Map();
        for (const record of records) placed.set(Number(record.time.slice(0, 2)), record);
        const covered = new Set();
        for (const record of records) {
            for (let h = Number(record.time.slice(0, 2)) + 1; h < Number(record.endTime.slice(0, 2)); h += 1) covered.add(h);
        }
        for (let h = OPEN_HOUR; h < CLOSE_HOUR; h += 1) {
            if (covered.has(h)) continue;
            const record = placed.get(h);
            wrap.append(el('div', { class: record ? 'slot' : 'slot is-free' },
                el('span', { class: 'slot-hour', text: hourTick(h) }),
                el('div', { class: 'slot-rail' },
                    record
                        ? el('button', {
                            type: 'button', class: 'slot-block', 'data-status': statusOf(record),
                            on: { click: () => openDetail(record.id) }
                        },
                            el('strong', { text: record.name }),
                            el('span', { text: `${span(record)} · ${statusWord(record)}` })
                        )
                        // An open hour is a button too: tapping it holds that hour.
                        : el('button', {
                            type: 'button', class: 'slot-open',
                            'aria-label': t('blockHourLabel', { hour: hourTick(h), day: relativeDay(iso) }),
                            on: { click: () => openBlock('hours', iso, h) }
                        },
                            el('span', { text: t('open') }),
                            el('em', { text: t('blockVerb') })
                        )
                )
            ));
        }
        return wrap;
    }

    /* ── Calendar ────────────────────────────────────────────────── */
    function renderCalendar() {
        const body = $('#calendar-body');
        const labelNode = $('#range-label');
        if (state.range === 'day') {
            labelNode.textContent = `${relativeDay(state.cursor)}${state.cursor === todayISO() ? '' : ''}`;
            const list = onDay(state.cursor, true);
            fill(body,
                timeline(state.cursor),
                el('h3', { class: 'section-title', text: t('appointmentsThisDay') }),
                el('div', { class: 'list' },
                    list.length ? list.map((r) => card(r, { showDay: false })) : emptyBox(t('noneThisDay'))
                )
            );
            return;
        }
        if (state.range === 'week') {
            const start = startOfWeek(state.cursor);
            const end = addDays(start, 6);
            labelNode.textContent = `${label(start, { month: 'short', day: 'numeric' })} – ${label(end, { month: 'short', day: 'numeric' })}`;
            const week = el('div', { class: 'week' });
            for (let i = 0; i < 7; i += 1) {
                const iso = addDays(start, i);
                const list = onDay(iso);
                week.append(el('section', { class: `week-day${iso === todayISO() ? ' is-today' : ''}` },
                    el('h4', {},
                        el('span', { text: label(iso, { weekday: 'long', month: 'short', day: 'numeric' }) }),
                        el('em', { text: list.length ? t('booked', { n: list.length }) : t('openDay') })
                    ),
                    el('div', { class: 'list' },
                        list.length ? list.map((r) => card(r, { showDay: false })) : null
                    )
                ));
            }
            fill(body, week);
            return;
        }
        // month
        const first = `${state.cursor.slice(0, 7)}-01`;
        labelNode.textContent = label(first, { month: 'long', year: 'numeric' });
        const grid = el('div', { class: 'month' });
        for (const name of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) grid.append(el('div', { class: 'month-head', text: name }));
        const lead = weekdayOf(first);
        for (let i = 0; i < lead; i += 1) grid.append(el('div', {}));
        const monthKey = first.slice(0, 7);
        let iso = first;
        while (iso.slice(0, 7) === monthKey) {
            const list = onDay(iso);
            const confirmed = list.filter((r) => r.status === 'confirmed').length;
            const pending = list.filter((r) => r.status === 'pending').length;
            const classes = ['day'];
            if (list.length) classes.push('has-any');
            if (iso === todayISO()) classes.push('is-today');
            if (iso === state.cursor) classes.push('is-picked');
            const day = iso;
            grid.append(el('button', {
                type: 'button', class: classes.join(' '),
                'data-date': day,
                on: { click: () => { state.cursor = day; state.range = 'day'; syncSegmented(); renderCalendar(); } }
            },
                el('span', { text: String(Number(day.slice(8))) }),
                el('span', { class: 'day-dots' },
                    confirmed ? el('i', { 'data-kind': 'confirmed' }) : null,
                    pending ? el('i', { 'data-kind': 'pending' }) : null
                )
            ));
            iso = addDays(iso, 1);
        }
        const monthList = active().filter((r) => r.date.slice(0, 7) === monthKey).sort(byStart);
        fill(body,
            grid,
            el('h3', { class: 'section-title', text: t('monthCount', { n: plural(monthList.length, 'appointment') }) }),
            el('div', { class: 'list' }, monthList.slice(0, 20).map((r) => card(r)))
        );
    }

    function syncSegmented() {
        document.querySelectorAll('.segmented button').forEach((b) => {
            b.setAttribute('aria-selected', String(b.dataset.range === state.range));
        });
    }

    function stepRange(direction) {
        if (state.range === 'day') state.cursor = addDays(state.cursor, direction);
        else if (state.range === 'week') state.cursor = addDays(state.cursor, direction * 7);
        else {
            const [y, m] = state.cursor.split('-').map(Number);
            const moved = new Date(Date.UTC(y, m - 1 + direction, 1));
            state.cursor = moved.toISOString().slice(0, 10);
        }
        renderCalendar();
    }

    /* ── Requests and All ────────────────────────────────────────── */
    function renderRequests() {
        const today = todayISO();
        const list = state.records
            .filter((r) => r.status === 'pending' && r.date >= today)
            .sort(byStart);
        const past = state.records
            .filter((r) => r.status === 'pending' && r.date < today)
            .sort(byStart);
        fill($('#requests-list'),
            list.length ? list.map((r) => card(r)) : emptyBox(t('noRequests')),
            past.length ? el('h3', { class: 'section-title', text: t('expiredRequests') }) : null,
            past.length ? past.map((r) => card(r)) : null
        );
    }

    function renderAllList() {
        const query = state.query.trim().toLowerCase();
        const list = state.records
            .filter((r) => state.status === 'all' || r.status === state.status)
            .filter((r) => !query || [r.name, r.email, r.phone, describe(r)].join(' ').toLowerCase().includes(query))
            .sort((a, b) => byStart(b, a));
        fill($('#all-list'),
            list.length ? list.map((r) => card(r)) : emptyBox(t('noMatches'))
        );
    }

    function renderAll() {
        renderToday();
        renderCalendar();
        renderRequests();
        renderAllList();
        if (state.selected) {
            const current = state.records.find((r) => r.id === state.selected);
            if (current && $('#sheet-detail').open) fillDetail(current);
        }
    }

    /* ── Detail sheet ────────────────────────────────────────────── */
    function fact(term, value) {
        if (!value) return null;
        return el('div', {}, el('dt', { text: term }), el('dd', {}, value));
    }

    /* The website queues customer emails itself; this reports where they got to. */
    const mailState = (state) => ({ queued: t('mailQueued'), sent: t('mailSent'), cancelled: t('mailCancelled'), skipped: t('mailSkipped'), preview: t('mailPreview') })[state] || t('mailPending');

    function deliveryText(record) {
        const jobs = record.notifications || {};
        const parts = [];
        if (jobs.receipt) parts.push(t('mailReceipt', { state: mailState(jobs.receipt.state) }));
        if (jobs.confirmation) parts.push(t('mailConfirmation', { state: mailState(jobs.confirmation.state) }));
        if (record.emailReminder) {
            parts.push(t('mailReminder', { state: jobs.reminder ? mailState(jobs.reminder.state) : t('mailWaits') }));
        }
        if (Object.values(jobs).some((job) => job && job.lastError && job.state === 'queued')) {
            parts.push(t('mailNeedsAttention'));
        }
        if (!record.email) return t('noEmailOnFile');
        return parts.length ? parts.join(' · ') : t('nothingQueued');
    }

    function fillDetail(record) {
        const block = isBlock(record);
        $('#detail-status').textContent = statusWord(record);
        $('#detail-status').dataset.status = statusOf(record);
        $('#detail-name').textContent = record.name;
        $('#detail-when').textContent = `${label(record.date, { weekday: 'long', month: 'long', day: 'numeric' })} · ${span(record)}`;

        fill($('#detail-facts'),
            block ? null : fact(t('factServices'), describe(record)),
            fact(t('factLength'), plural(record.scheduledHours || 1, 'hour')),
            block ? null : fact(t('factLocation'), record.location && record.location !== 'manual' ? record.location : t('notSet')),
            record.phone ? fact(t('factPhone'), el('a', { href: `tel:${record.phone.replace(/[^0-9+]/g, '')}`, text: record.phone })) : null,
            record.email ? fact(t('factEmail'), el('a', { href: `mailto:${record.email}`, text: record.email })) : null,
            record.note ? fact(t('factNote'), record.note) : null,
            record.previousSchedule ? fact(t('factMovedFrom'), `${label(record.previousSchedule.date, { month: 'short', day: 'numeric' })} · ${hhmm(record.previousSchedule.time)}`) : null,
            record.autoExpired ? fact(t('factClosed'), t('closedAutomatically')) : null,
            record.language === 'es' ? fact(t('factLanguage'), t('spanishWord')) : null,
            block ? null : fact(t('factEmails'), deliveryText(record)),
            fact(t('factKind'), block ? t('kindBlock') : (record.source === 'manual' ? t('kindManual') : t('kindWebsite')))
        );

        $('#detail-warn').hidden = !(record.status === 'pending' && record.source !== 'manual' && record.emailSent === false);

        const actions = $('#detail-actions');
        actions.replaceChildren();
        if (record.status === 'pending') {
            actions.append(el('button', {
                type: 'button', class: 'primary', text: t('actionConfirm'),
                on: { click: () => mutate({ action: 'confirm', id: record.id }, t('toastConfirmed')) }
            }));
        }
        if (record.status !== 'cancelled') {
            actions.append(el('button', {
                type: 'button', text: block ? t('actionMoveBlock') : t('actionMove'),
                on: { click: () => openMove(record) }
            }));
            actions.append(el('button', {
                type: 'button', class: 'danger',
                text: block ? t('actionFree') : t('actionCancel'),
                on: { click: () => openCancel(record) }
            }));
        }
        if (record.phone) actions.append(el('a', { href: `tel:${record.phone.replace(/[^0-9+]/g, '')}`, text: t('actionCall') }));
        if (record.email) actions.append(el('a', { href: `mailto:${record.email}`, text: t('actionEmail') }));
    }

    function openDetail(id) {
        const record = state.records.find((r) => r.id === id);
        if (!record) return;
        state.selected = id;
        fillDetail(record);
        $('#sheet-detail').showModal();
    }

    function openMove(record) {
        const form = $('#move-form');
        form.dataset.id = record.id;
        form.elements.date.value = record.date < todayISO() ? todayISO() : record.date;
        form.elements.time.value = record.time;
        form.elements.hours.value = String(record.scheduledHours || 1);
        $('#move-who').textContent = `${record.name} · now ${relativeDay(record.date)} ${span(record)}`;
        writeFreeHint('#move-free', form, record.id);
        $('#sheet-detail').close();
        $('#sheet-move').showModal();
    }

    function openCancel(record) {
        const block = isBlock(record);
        $('#sheet-cancel').dataset.id = record.id;
        $('#sheet-cancel').dataset.block = block ? '1' : '';
        $('#cancel-title').textContent = block ? t('cancelTitleBlock') : t('cancelTitleBooking');
        $('#cancel-explain').textContent = block ? t('cancelExplainBlock') : t('cancelExplainBooking');
        $('#cancel-confirm').textContent = block ? t('actionFree') : t('actionCancel');
        $('#cancel-keep').textContent = block ? t('cancelKeepBlock') : t('cancelKeepBooking');
        $('#cancel-who').textContent = `${record.name} · ${label(record.date, { weekday: 'long', month: 'long', day: 'numeric' })} · ${span(record)}`;
        $('#sheet-detail').close();
        $('#sheet-cancel').showModal();
    }

    function openAdd(iso) {
        const form = $('#add-form');
        form.reset();
        document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== 'sheet-add') d.close(); });
        form.elements.date.value = iso && iso >= todayISO() ? iso : todayISO();
        form.elements.hours.value = '1';
        const starts = freeStarts(form.elements.date.value, 1);
        if (starts.length) form.elements.time.value = `${String(starts[0]).padStart(2, '0')}:00`;
        writeFreeHint('#add-free', form);
        $('#sheet-add').showModal();
    }

    /* ── tabs ────────────────────────────────────────────────────── */
    const TITLES = {
        today: ['titleTodayEyebrow', 'titleToday'],
        calendar: ['titleCalendarEyebrow', 'titleCalendar'],
        requests: ['titleRequestsEyebrow', 'titleRequests'],
        all: ['titleAllEyebrow', 'titleAll']
    };

    function showTab(name) {
        state.tab = name;
        document.querySelectorAll('.screen').forEach((screen) => {
            const on = screen.id === `screen-${name}`;
            screen.hidden = !on;
            screen.classList.toggle('is-active', on);
        });
        document.querySelectorAll('.tab').forEach((tab) => {
            const on = tab.dataset.tab === name;
            tab.classList.toggle('is-on', on);
            if (on) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
        });
        const [eyebrow, title] = TITLES[name];
        $('#topbar-eyebrow').textContent = t(eyebrow);
        $('#topbar-title').textContent = t(title);
        window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }

    /* ── wiring ──────────────────────────────────────────────────── */
    document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
    document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.goto)));
    document.querySelectorAll('[data-open-add]').forEach((b) => b.addEventListener('click', () => openAdd(state.tab === 'calendar' ? state.cursor : null)));
    document.querySelectorAll('[data-close-sheet]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    document.querySelectorAll('dialog.sheet').forEach((dialog) => {
        dialog.addEventListener('click', (event) => { if (event.target === dialog && dialog.id !== 'sheet-session') dialog.close(); });
    });

    $('#refresh-button').addEventListener('click', () => load(true));

    document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
        state.range = b.dataset.range;
        syncSegmented();
        renderCalendar();
    }));
    $('#range-prev').addEventListener('click', () => stepRange(-1));
    $('#range-next').addEventListener('click', () => stepRange(1));
    $('#range-today').addEventListener('click', () => { state.cursor = todayISO(); renderCalendar(); });

    $('#search-input').addEventListener('input', (event) => { state.query = event.target.value; renderAllList(); });
    document.querySelectorAll('.chip').forEach((chip) => chip.addEventListener('click', () => {
        state.status = chip.dataset.status;
        document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === chip));
        renderAllList();
    }));

    const addForm = $('#add-form');
    ['date', 'hours'].forEach((field) => addForm.elements[field].addEventListener('input', () => writeFreeHint('#add-free', addForm)));
    addForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            action: 'create',
            name: addForm.elements.name.value.trim(),
            phone: addForm.elements.phone.value.trim(),
            email: addForm.elements.email.value.trim(),
            note: addForm.elements.note.value.trim(),
            date: addForm.elements.date.value,
            time: addForm.elements.time.value,
            hours: Number(addForm.elements.hours.value)
        };
        await mutate(payload, t('toastAdded'));
    });

    const moveForm = $('#move-form');
    ['date', 'hours'].forEach((field) => moveForm.elements[field].addEventListener('input', () => writeFreeHint('#move-free', moveForm, moveForm.dataset.id)));
    moveForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await mutate({
            action: 'reschedule',
            id: moveForm.dataset.id,
            date: moveForm.elements.date.value,
            time: moveForm.elements.time.value,
            hours: Number(moveForm.elements.hours.value)
        }, t('toastMoved'));
    });

    $('#cancel-confirm').addEventListener('click', () => {
        const sheet = $('#sheet-cancel');
        mutate({ action: 'cancel', id: sheet.dataset.id }, sheet.dataset.block ? t('toastFreed') : t('toastCancelled'));
    });

    /* ── blocking time ───────────────────────────────────────────── */
    const blockForm = $('#block-form');

    function setBlockMode(mode) {
        state.blockMode = mode;
        document.querySelectorAll('[data-block-mode]').forEach((b) => {
            b.setAttribute('aria-selected', String(b.dataset.blockMode === mode));
        });
        document.querySelectorAll('[data-block-field]').forEach((group) => {
            group.hidden = group.dataset.blockField !== mode;
        });
        $('#block-submit').textContent = mode === 'hours' ? t('blockSubmitHours')
            : mode === 'day' ? t('blockSubmitDay') : t('blockSubmitRange');
        previewBlock();
    }

    /** Works out exactly which hours a block would take, so nothing is a surprise. */
    function blockPlan() {
        const mode = state.blockMode;
        if (mode === 'hours') {
            const date = blockForm.elements.date.value;
            if (!date) return { error: t('pickDate') };
            if (date < todayISO()) return { error: t('datePassed') };
            const hours = Number(blockForm.elements.hours.value) || 1;
            const start = Number(blockForm.elements.time.value.slice(0, 2));
            if (start + hours > CLOSE_HOUR) return { error: t('runsPast', { hour: hourTick(CLOSE_HOUR) }) };
            const taken = occupiedHours(date);
            for (let h = start; h < start + hours; h += 1) {
                if (taken.has(h)) return { error: t('alreadyTaken', { hour: hourTick(h), day: relativeDay(date) }) };
            }
            return { slots: [{ date, time: pad(start), hours }] };
        }
        if (mode === 'day') {
            const date = blockForm.elements.dayDate.value;
            if (!date) return { error: t('pickDay') };
            if (date < todayISO()) return { error: t('dayPassed') };
            return { slots: freeRuns(date), days: 1 };
        }
        const from = blockForm.elements.fromDate.value;
        const to = blockForm.elements.toDate.value;
        if (!from || !to) return { error: t('pickRange') };
        if (to < from) return { error: t('lastBeforeFirst') };
        if (from < todayISO()) return { error: t('firstDayPassed') };
        const slots = [];
        let day = from;
        let days = 0;
        while (day <= to) {
            if (days > 90) return { error: t('atMost90') };
            slots.push(...freeRuns(day));
            days += 1;
            day = addDays(day, 1);
        }
        return { slots, days };
    }

    function previewBlock() {
        const node = $('#block-free');
        const plan = blockPlan();
        if (plan.error) { node.textContent = plan.error; return; }
        if (!plan.slots.length) { node.textContent = t('nothingFree'); return; }
        const hours = plan.slots.reduce((sum, s) => sum + s.hours, 0);
        node.textContent = plan.days
            ? t('willBlockDays', { hours: plural(hours, 'hour'), days: plural(plan.days, 'day') })
            : t('willBlock', { hours: plural(hours, 'hour') });
    }

    function openBlock(mode, iso, hour) {
        blockForm.reset();
        blockForm.elements.label.value = t(mode === 'hours' ? 'presetUnavailable' : 'presetDayOff');
        const start = iso && iso >= todayISO() ? iso : todayISO();
        blockForm.elements.date.value = start;
        blockForm.elements.dayDate.value = start;
        blockForm.elements.fromDate.value = start;
        blockForm.elements.toDate.value = start;
        blockForm.elements.hours.value = '1';
        if (hour !== undefined) blockForm.elements.time.value = pad(hour);
        document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== 'sheet-block') d.close(); });
        setBlockMode(mode);
        $('#sheet-block').showModal();
    }

    /** Blocks run slot by slot so a day that is partly booked still works. */
    async function runBlock() {
        if (state.busy) return;
        const plan = blockPlan();
        if (plan.error) { toast(plan.error, 'bad'); return; }
        if (!plan.slots.length) { toast(t('nothingFree'), 'bad'); return; }
        const name = blockForm.elements.label.value.trim() || t('presetUnavailable');

        state.busy = true;
        document.querySelectorAll('.sheet button').forEach((b) => { b.disabled = true; });
        toast(t('toastBlocking'));
        let hours = 0;
        let refused = 0;
        let stopped = false;
        for (const slot of plan.slots) {
            try {
                await call({ action: 'create', kind: 'block', name, date: slot.date, time: slot.time, hours: slot.hours });
                hours += slot.hours;
            } catch (error) {
                if (error.message === t('errSignIn') || error.message === 'offline') { stopped = true; break; }
                refused += 1;
            }
        }
        await load(false);
        document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== 'sheet-session') d.close(); });
        if (stopped && !hours) toast(t('toastNothingBlocked'), 'bad');
        else {
            let message = t('toastBlocked', { hours: plural(hours, 'hour') });
            if (refused) message += t('toastRefused', { n: plural(refused, 'stretch') });
            toast(message, refused ? 'bad' : undefined);
        }
        state.busy = false;
        document.querySelectorAll('.sheet button').forEach((b) => { b.disabled = false; });
    }

    document.querySelectorAll('[data-block-mode]').forEach((b) => b.addEventListener('click', () => setBlockMode(b.dataset.blockMode)));
    document.querySelectorAll('#block-form .chip').forEach((chip) => chip.addEventListener('click', () => {
        blockForm.elements.label.value = t(chip.dataset.labelKey);
    }));
    ['date', 'hours', 'time', 'dayDate', 'fromDate', 'toDate'].forEach((field) => {
        blockForm.elements[field].addEventListener('input', previewBlock);
        blockForm.elements[field].addEventListener('change', previewBlock);
    });
    blockForm.addEventListener('submit', (event) => { event.preventDefault(); runBlock(); });
    document.querySelectorAll('[data-open-block]').forEach((b) => b.addEventListener('click', () => {
        openBlock(b.dataset.openBlock, state.tab === 'calendar' ? state.cursor : null);
    }));

    /* ── opening blocked time back up ────────────────────────────────
       The mirror of blocking. It only ever cancels records of kind
       'block' — a customer's appointment is never cancelled this way,
       however the dates are chosen. */
    const freeForm = $('#free-form');

    function setFreeMode(mode) {
        if (!freeForm) return;
        state.freeMode = mode;
        document.querySelectorAll('[data-free-mode]').forEach((b) => {
            b.setAttribute('aria-selected', String(b.dataset.freeMode === mode));
        });
        document.querySelectorAll('[data-free-field]').forEach((group) => {
            group.hidden = group.dataset.freeField !== mode;
        });
        $('#free-submit').textContent = mode === 'hours' ? t('freeSubmitHours')
            : mode === 'day' ? t('freeSubmitDay') : t('freeSubmitRange');
        previewFree();
    }

    const liveBlocks = () => state.records.filter((r) => isBlock(r) && HOLDS_TIME.includes(r.status));
    const liveBookings = () => state.records.filter((r) => !isBlock(r) && HOLDS_TIME.includes(r.status));

    const wholeHours = (list) => list.reduce((sum, r) => sum + (r.scheduledHours || 1), 0);

    /** The end hour the form is asking for. Falls back to the old hour-count
        field so a page cached before this version still works. */
    function freeEndHour(start) {
        const field = freeForm.elements.final;
        if (field) return Number(String(field.value).slice(0, 2));
        const count = freeForm.elements.hours;
        return start + (Number(count && count.value) || 1);
    }

    function freePlan() {
        const mode = state.freeMode;
        if (mode === 'hours') {
            const date = freeForm.elements.date.value;
            if (!date) return { error: t('pickDate') };
            if (date < todayISO()) return { error: t('datePassed') };
            const start = Number(freeForm.elements.time.value.slice(0, 2));
            const end = freeEndHour(start);
            if (end <= start) return { error: t('endBeforeStart') };
            // Hours that have already gone by today are closed out by the server,
            // so there is nothing left there to open — say so plainly.
            if (date === todayISO() && end <= nowHour() + 1) return { error: t('freePast') };
            const overlaps = (r) => r.date === date
                && Number(r.time.slice(0, 2)) < end && start < Number(r.endTime.slice(0, 2));
            const blocks = liveBlocks().filter(overlaps);
            // Only the chosen stretch opens: whatever of a block falls outside it
            // is blocked again straight after, so a day off stays a day off.
            const keep = [];
            let opened = 0;
            for (const block of blocks) {
                const from = Number(block.time.slice(0, 2));
                const to = Number(block.endTime.slice(0, 2));
                opened += Math.min(to, end) - Math.max(from, start);
                if (from < start) keep.push({ date, time: pad(from), hours: start - from, name: block.name });
                if (to > end) keep.push({ date, time: pad(end), hours: to - end, name: block.name });
            }
            return { blocks, keep, opened, from: start, to: end, kept: liveBookings().filter(overlaps).length };
        }
        if (mode === 'day') {
            const date = freeForm.elements.dayDate.value;
            if (!date) return { error: t('pickDay') };
            const blocks = liveBlocks().filter((r) => r.date === date);
            return { blocks, keep: [], opened: wholeHours(blocks), kept: liveBookings().filter((r) => r.date === date).length, days: 1 };
        }
        const from = freeForm.elements.fromDate.value;
        const to = freeForm.elements.toDate.value;
        if (!from || !to) return { error: t('pickRange') };
        if (to < from) return { error: t('lastBeforeFirst') };
        const inRange = (r) => r.date >= from && r.date <= to;
        let days = 0;
        for (let d = from; d <= to; d = addDays(d, 1)) days += 1;
        const blocks = liveBlocks().filter(inRange);
        return { blocks, keep: [], opened: wholeHours(blocks), kept: liveBookings().filter(inRange).length, days };
    }

    function previewFree() {
        const node = $('#free-preview');
        const plan = freePlan();
        if (plan.error) { node.textContent = plan.error; return; }
        if (!plan.blocks.length) {
            node.textContent = t('freeNothing') + (plan.kept ? t('freeKept', { n: plural(plan.kept, 'appointment') }) : '');
            return;
        }
        const hours = plural(plan.opened, 'hour');
        let text = plan.days
            ? t('freeWillOpenDays', { hours, days: plural(plan.days, 'day') })
            : t('freeWillOpenSpan', { hours, from: hhmm(pad(plan.from)), to: hhmm(pad(plan.to)) });
        if (plan.keep.length) text += t('freeKeepsRest');
        if (plan.kept) text += t('freeKept', { n: plural(plan.kept, 'appointment') });
        node.textContent = text;
    }

    function openFree(iso) {
        if (!freeForm) return;
        freeForm.reset();
        const start = iso && iso >= todayISO() ? iso : todayISO();
        freeForm.elements.date.value = start;
        freeForm.elements.dayDate.value = start;
        freeForm.elements.fromDate.value = start;
        freeForm.elements.toDate.value = start;
        // Open on the next hour that is still ahead, through to closing, so the
        // first thing on screen is a stretch that can actually be opened.
        const first = start === todayISO() ? Math.min(Math.max(OPEN_HOUR, nowHour() + 1), CLOSE_HOUR - 1) : OPEN_HOUR;
        freeForm.elements.time.value = pad(first);
        if (freeForm.elements.final) freeForm.elements.final.value = pad(CLOSE_HOUR);
        else if (freeForm.elements.hours) freeForm.elements.hours.value = '1';
        document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== 'sheet-free') d.close(); });
        setFreeMode(state.freeMode || 'hours');
        $('#sheet-free').showModal();
    }

    async function runFree() {
        if (state.busy) return;
        const plan = freePlan();
        if (plan.error) { toast(plan.error, 'bad'); return; }
        if (!plan.blocks.length) { toast(t('freeNothing'), 'bad'); return; }

        state.busy = true;
        document.querySelectorAll('.sheet button').forEach((b) => { b.disabled = true; });
        toast(t('toastFreeing'));
        let hours = 0;
        let stopped = false;
        const freed = [];
        for (const block of plan.blocks) {
            try {
                await call({ action: 'cancel', id: block.id });
                freed.push(block.id);
                hours += Math.min(Number(block.endTime.slice(0, 2)), plan.to === undefined ? 99 : plan.to)
                       - Math.max(Number(block.time.slice(0, 2)), plan.from === undefined ? -99 : plan.from);
            } catch (error) {
                if (error.message === t('errSignIn') || error.message === 'offline') { stopped = true; break; }
            }
        }
        // Put back the parts of a block that fall outside the chosen stretch, so
        // only the hours asked for are handed back to the website. Segments that
        // are already in the past are left out — the server refuses those anyway.
        if (!stopped) {
            const cutoff = plan.keep.length && plan.keep[0].date === todayISO() ? nowHour() : -1;
            for (const slot of plan.keep) {
                if (!freed.length) break;
                const from = Number(slot.time.slice(0, 2));
                if (from + slot.hours <= cutoff + 1) continue;
                const trimmed = Math.max(from, cutoff + 1);
                try {
                    await call({ action: 'create', kind: 'block', name: slot.name || t('presetUnavailable'),
                                 date: slot.date, time: pad(trimmed), hours: from + slot.hours - trimmed });
                } catch (error) {
                    if (error.message === t('errSignIn') || error.message === 'offline') break;
                }
            }
        }
        await load(false);
        document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== 'sheet-session') d.close(); });
        toast(stopped && !hours ? t('toastNothingOpened') : t('toastOpened', { hours: plural(hours, 'hour') }),
              stopped && !hours ? 'bad' : undefined);
        state.busy = false;
        document.querySelectorAll('.sheet button').forEach((b) => { b.disabled = false; });
    }

    // Wired only when the sheet is present, so a page served before this
    // script is updated cannot break the rest of the app.
    if (freeForm) {
        document.querySelectorAll('[data-free-mode]').forEach((b) => b.addEventListener('click', () => setFreeMode(b.dataset.freeMode)));
        // Keep the end after the start, so the pair is never a dead end.
        const syncFreeEnd = () => {
            const end = freeForm.elements.final;
            if (!end) return;
            const start = Number(freeForm.elements.time.value.slice(0, 2));
            if (Number(String(end.value).slice(0, 2)) <= start) end.value = pad(Math.min(start + 1, CLOSE_HOUR));
        };
        ['date', 'hours', 'final', 'time', 'dayDate', 'fromDate', 'toDate'].forEach((field) => {
            const input = freeForm.elements[field];
            if (!input) return;
            const onChange = () => { if (field === 'time') syncFreeEnd(); previewFree(); };
            input.addEventListener('input', onChange);
            input.addEventListener('change', onChange);
        });
        freeForm.addEventListener('submit', (event) => { event.preventDefault(); runFree(); });
        document.querySelectorAll('[data-open-free]').forEach((b) => b.addEventListener('click', () => {
            openFree(state.tab === 'calendar' ? state.cursor : null);
        }));
    }

    /* ── the hours the website offers ────────────────────────────────
       The public booking page has a standing weekly pattern. This sets a
       window for one date, or a run of dates, which wins over that pattern.
       It is not a block: these hours are what customers may book, while the
       manager can still take a booking by phone at any hour. */
    const hoursForm = $('#hours-form');
    const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const weekdayKeyOf = (iso) => WEEKDAY_KEYS[new Date(utcOf(iso)).getUTCDay()];
    const siteFloor = () => (state.bounds && state.bounds.opening) || OPEN_HOUR;
    const siteCeiling = () => (state.bounds && state.bounds.closing) || CLOSE_HOUR;
    /** The weekday's standing window, or null when the website is closed then. */
    const usualWindow = (iso) => {
        const weekly = (state.schedule && state.schedule.weekly) || {};
        const window = weekly[weekdayKeyOf(iso)];
        return Array.isArray(window) ? window : null;
    };

    function setHoursMode(mode) {
        if (!hoursForm) return;
        state.hoursMode = mode;
        document.querySelectorAll('[data-hours-mode]').forEach((b) => {
            b.setAttribute('aria-selected', String(b.dataset.hoursMode === mode));
        });
        document.querySelectorAll('[data-hours-field]').forEach((group) => {
            group.hidden = group.dataset.hoursField !== mode;
        });
        $('#hours-submit').textContent = mode === 'hours' ? t('hoursSave')
            : mode === 'day' ? t('hoursSaveDay') : t('hoursSaveRange');
        previewHours();
    }

    /** Which dates get which window, or the first thing that is wrong. */
    function hoursPlan() {
        const mode = state.hoursMode;
        const floor = siteFloor();
        const ceiling = siteCeiling();
        if (mode === 'hours') {
            const date = hoursForm.elements.date.value;
            if (!date) return { error: t('pickDate') };
            if (date < todayISO()) return { error: t('datePassed') };
            const start = Number(hoursForm.elements.time.value.slice(0, 2));
            const end = Number(String(hoursForm.elements.final.value).slice(0, 2));
            if (end <= start) return { error: t('endBeforeStart') };
            if (date === todayISO() && end <= nowHour() + 1) return { error: t('freePast') };
            return { dates: [date], start, end };
        }
        if (mode === 'day') {
            const date = hoursForm.elements.dayDate.value;
            if (!date) return { error: t('pickDay') };
            if (date < todayISO()) return { error: t('dayPassed') };
            return { dates: [date], start: floor, end: ceiling };
        }
        const from = hoursForm.elements.fromDate.value;
        const to = hoursForm.elements.toDate.value;
        if (!from || !to) return { error: t('pickRange') };
        if (to < from) return { error: t('lastBeforeFirst') };
        if (from < todayISO()) return { error: t('firstDayPassed') };
        const dates = [];
        for (let day = from; day <= to; day = addDays(day, 1)) {
            if (dates.length >= 90) return { error: t('hoursAtMost90') };
            dates.push(day);
        }
        return { dates, start: floor, end: ceiling };
    }

    function previewHours() {
        const node = $('#hours-preview');
        const plan = hoursPlan();
        if (plan.error) { node.textContent = plan.error; return; }
        const from = hhmm(pad(plan.start));
        const to = hhmm(pad(plan.end));
        if (plan.dates.length === 1) {
            const date = plan.dates[0];
            const usual = usualWindow(date);
            if (usual && usual[0] === plan.start && usual[1] === plan.end) {
                node.textContent = t('hoursSameAsUsual', { day: relativeDay(date) });
                return;
            }
            let text = t('hoursWillOpen', { from, to, day: relativeDay(date) });
            text += usual
                ? t('hoursNormally', { normal: `${hhmm(pad(usual[0]))}–${hhmm(pad(usual[1]))}` })
                : t('hoursNormallyClosed');
            if (date === todayISO() && plan.start <= nowHour()) {
                text += t('hoursPastPart', { from: hhmm(pad(nowHour() + 1)) });
            }
            node.textContent = text;
            return;
        }
        node.textContent = t('hoursWillOpenDays', { from, to, days: plural(plan.dates.length, 'day') });
    }

    function openHours(iso) {
        if (!hoursForm) return;
        if (!state.schedule) { toast(t('hoursUnavailable'), 'bad'); return; }
        hoursForm.reset();
        const start = iso && iso >= todayISO() ? iso : todayISO();
        hoursForm.elements.date.value = start;
        hoursForm.elements.dayDate.value = start;
        hoursForm.elements.fromDate.value = start;
        hoursForm.elements.toDate.value = start;
        const first = start === todayISO()
            ? Math.min(Math.max(siteFloor(), nowHour() + 1), siteCeiling() - 1)
            : siteFloor();
        hoursForm.elements.time.value = pad(first);
        hoursForm.elements.final.value = pad(siteCeiling());
        document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== 'sheet-hours') d.close(); });
        setHoursMode(state.hoursMode || 'hours');
        $('#sheet-hours').showModal();
    }

    async function runHours() {
        if (state.busy) return;
        const plan = hoursPlan();
        if (plan.error) { toast(plan.error, 'bad'); return; }
        const dates = {};
        for (const date of plan.dates) dates[date] = [plan.start, plan.end];
        state.busy = true;
        document.querySelectorAll('.sheet button').forEach((b) => { b.disabled = true; });
        toast(t('toastHoursSaving'));
        try {
            const result = await call({ action: 'availability', dates });
            if (result.schedule) state.schedule = result.schedule;
            document.querySelectorAll('dialog[open]').forEach((d) => { if (d.id !== 'sheet-session') d.close(); });
            toast(t('toastHoursSaved'));
        } catch (error) {
            toast(error.message === 'offline' ? t('errOffline') : error.message, 'bad');
        } finally {
            state.busy = false;
            document.querySelectorAll('.sheet button').forEach((b) => { b.disabled = false; });
        }
    }

    if (hoursForm) {
        // Keep the end after the start, so the pair is never a dead end.
        const syncHoursEnd = () => {
            const end = hoursForm.elements.final;
            const start = Number(hoursForm.elements.time.value.slice(0, 2));
            if (Number(String(end.value).slice(0, 2)) <= start) end.value = pad(Math.min(start + 1, siteCeiling()));
        };
        document.querySelectorAll('[data-hours-mode]').forEach((b) => b.addEventListener('click', () => setHoursMode(b.dataset.hoursMode)));
        ['date', 'time', 'final', 'dayDate', 'fromDate', 'toDate'].forEach((field) => {
            const input = hoursForm.elements[field];
            if (!input) return;
            const onChange = () => { if (field === 'time') syncHoursEnd(); previewHours(); };
            input.addEventListener('input', onChange);
            input.addEventListener('change', onChange);
        });
        hoursForm.addEventListener('submit', (event) => { event.preventDefault(); runHours(); });
        document.querySelectorAll('[data-open-hours]').forEach((b) => b.addEventListener('click', () => {
            openHours(state.tab === 'calendar' ? state.cursor : null);
        }));
    }

    $('#fab').addEventListener('click', () => $('#sheet-new').showModal());

    /* ── keep in step with the website ───────────────────────────── */
    let timer = window.setInterval(() => { if (!document.hidden) load(false); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
    window.addEventListener('focus', () => load(false));
    window.addEventListener('online', () => load(false));
    window.addEventListener('offline', () => connection(t('offlineBanner')));
    window.addEventListener('pagehide', () => window.clearInterval(timer));

    const langButton = $('#lang-button');
    if (langButton) {
        langButton.addEventListener('click', () => {
            LANG = LANG === 'es' ? 'en' : 'es';
            document.cookie = 'booking_app_lang=' + LANG + ';path=/;max-age=31536000;samesite=strict';
            applyStaticStrings();
            showTab(state.tab);
            renderAll();
            setBlockMode(state.blockMode);
            setFreeMode(state.freeMode);
        });
    }

    applyStaticStrings();
    syncSegmented();
    showTab('today');
    load(true);

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/appointments-sw.js', { scope: '/' }).catch(() => { /* the app works without it */ });
        });
    }
})();
