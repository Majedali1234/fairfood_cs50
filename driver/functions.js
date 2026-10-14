// =============================================================
// Fairfood Price â€“ Driver Functions (Standalone)
// =============================================================

function sg(k, d) { try { var v = localStorage.getItem(k); return v !== null ? v : d; } catch (e) { return d; } }
function ss(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function sr(k) { try { localStorage.removeItem(k); } catch (e) {} }

var API_BASE = '/api/v1';
var LANG = sg('driver_lang') || 'ar';
var STATE = {
  token: sg('driver_token') || null,
  user: null,
  isOnline: sg('driver_online') === 'true',
  activeDelivery: null,
  orders: [],
  currentScreen: 'home',
  settings: { language: LANG, theme: sg('driver_theme') || 'light', sounds: sg('driver_sounds') !== 'false' }
};
var _pollTimer = null;
var _activePollTimer = null;
var _knownOrderIds = new Set();

var TRANS = {
  ar: {
    app_title:'Fairfood Price - ط§ظ„ط³ط§ط¦ظ‚', loading:'ط¬ط§ط±ظٹ ط§ظ„طھط­ظ…ظٹظ„â€¦', locating:'ط¬ط§ط±ظٹ طھط­ط¯ظٹط¯ ط§ظ„ظ…ظˆظ‚ط¹â€¦',
    online:'ًںں¢ ظ…طھطµظ„', offline:'ًں”´ ط؛ظٹط± ظ…طھطµظ„', home:'ط§ظ„ط±ط¦ظٹط³ظٹط©', incoming_orders:'ط·ظ„ط¨ط§طھ ط¬ط¯ظٹط¯ط©',
    active_delivery:'طھظˆطµظٹظ„ ظ†ط´ط·', earnings:'ط§ظ„ط£ط±ط¨ط§ط­', settings:'ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ',
    nav_home:'ط§ظ„ط±ط¦ظٹط³ظٹط©', nav_orders:'ط§ظ„ط·ظ„ط¨ط§طھ', nav_delivery:'ط§ظ„طھظˆطµظٹظ„',
    nav_earnings:'ط§ظ„ط£ط±ط¨ط§ط­', nav_settings:'ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ', nav_profile:'ظ…ظ„ظپظٹ', nav_wallet:'ط§ظ„ظ…ط­ظپط¸ط©',
    no_new_orders:'ظ„ط§ طھظˆط¬ط¯ ط·ظ„ط¨ط§طھ ط¬ط¯ظٹط¯ط© ط­ط§ظ„ظٹظ‹ط§', accept:'ظ‚ط¨ظˆظ„', reject:'ط±ظپط¶',
    new_order:'ط·ظ„ط¨ ط¬ط¯ظٹط¯', today_earnings:'ط±.ط³', today_deliveries:'طھظˆطµظٹظ„',
    offline_banner:'ط£ظ†طھ ط؛ظٹط± ظ…طھطµظ„ ط¨ط§ظ„ط¥ظ†طھط±ظ†طھ', reconnect_banner:'طھظ…طھ ط¥ط¹ط§ط¯ط© ط§ظ„ط§طھطµط§ظ„',
    map_unavailable:'ط§ظ„ط®ط±ظٹط·ط© ط؛ظٹط± ظ…طھط§ط­ط© ط­ط§ظ„ظٹط§ظ‹', navigate_google:'ًں—؛ï¸ڈ Google Maps',
    navigate_waze:'ًںڑ— Waze', call_customer:'ًں“‍ ط§طھطµط§ظ„', chat_customer:'ًں’¬ ظ…ط­ط§ط¯ط«ط©',
    emergency_support:'ًں†ک ط·ظˆط§ط±ط¦', close:'ط¥ط؛ظ„ط§ظ‚', back:'ط±ط¬ظˆط¹',
    estimated_time:'ط§ظ„ظˆظ‚طھ ط§ظ„طھظ‚ط¯ظٹط±ظٹ', delivery_fee:'ط±ط³ظˆظ… ط§ظ„طھظˆطµظٹظ„',
    pickup:'ط§ط³طھظ„ط§ظ…', dropoff:'طھظˆطµظٹظ„',
    earnings_today:'ط£ط±ط¨ط§ط­ ط§ظ„ظٹظˆظ…', deliveries_today:'طھظˆطµظٹظ„ط§طھ ط§ظ„ظٹظˆظ…',
    error_network:'ط®ط·ط£ ظپظٹ ط§ظ„ط§طھطµط§ظ„', error_general:'ط­ط¯ط« ط®ط·ط£', retry:'ط¥ط¹ط§ط¯ط© ط§ظ„ظ…ط­ط§ظˆظ„ط©',
    logout:'طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬', language:'ط§ظ„ظ„ط؛ط©', theme:'ط§ظ„ظ…ط¸ظ‡ط±', dark:'ط¯ط§ظƒظ†', light:'ظپط§طھط­',
    menu:'ط§ظ„ظ‚ط§ط¦ظ…ط©', main_navigation:'ط§ظ„ظ‚ط§ط¦ظ…ط© ط§ظ„ط±ط¦ظٹط³ظٹط©', no_active_order:'ظ„ط§ ظٹظˆط¬ط¯ طھظˆطµظٹظ„ ظ†ط´ط·',
    auth_welcome:'ظ…ط±ط­ط¨ط§ظ‹!', order_accepted:'طھظ… ظ‚ط¨ظˆظ„ ط§ظ„ط·ظ„ط¨',
    session_expired:'ط§ظ†طھظ‡طھ ط§ظ„ط¬ظ„ط³ط©', support_unavailable:'ط±ظ‚ظ… ط§ظ„ط¯ط¹ظ… ط؛ظٹط± ظ…طھط§ط­',
    my_profile:'ظ…ظ„ظپظٹ ط§ظ„ط´ط®طµظٹ', total_deliveries:'ط§ظ„طھظˆطµظٹظ„ط§طھ', weekly_earnings:'ط£ط³ط¨ظˆط¹ظٹ',
    monthly_earnings:'ط´ظ‡ط±ظٹ', documents:'ط§ظ„ظ…ط³طھظ†ط¯ط§طھ', vehicle_info:'ظ…ط¹ظ„ظˆظ…ط§طھ ط§ظ„ظ…ط±ظƒط¨ط©',
    notifications:'ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ', orders_history:'ط³ط¬ظ„ ط§ظ„ط·ظ„ط¨ط§طھ', wallet:'ط§ظ„ظ…ط­ظپط¸ط©',
    dashboard:'ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ…', wallet_balance:'ط§ظ„ط±طµظٹط¯ ط§ظ„ط­ط§ظ„ظٹ', withdraw:'ط·ظ„ط¨ ط³ط­ط¨',
    transaction_history:'ط³ط¬ظ„ ط§ظ„ط­ط±ظƒط§طھ', no_transactions:'ظ„ط§ طھظˆط¬ط¯ ط­ط±ظƒط§طھ ظ…ط§ظ„ظٹط©',
    no_orders_history:'ظ„ط§ ظٹظˆط¬ط¯ ط³ط¬ظ„ ط·ظ„ط¨ط§طھ', no_notifications:'ظ„ط§ طھظˆط¬ط¯ ط¥ط´ط¹ط§ط±ط§طھ',
    support:'ط§ظ„ط¯ط¹ظ… ط§ظ„ظپظ†ظٹ', about:'ط¹ظ† ط§ظ„طھط·ط¨ظٹظ‚',
    type_message:'ط§ظƒطھط¨ ط±ط³ط§ظ„ط©...', send:'ط¥ط±ط³ط§ظ„', order_history:'طھط§ط±ظٹط® ط§ظ„ط·ظ„ط¨',
    amount:'ط§ظ„ظ…ط¨ظ„ط؛', distance:'ط§ظ„ظ…ط³ط§ظپط©', status:'ط§ظ„ط­ط§ظ„ط©',
    delivery_sheet_title:'طھظˆطµظٹظ„ ظ†ط´ط·',
    order_accepted_message:'طھظ… ظ‚ط¨ظˆظ„ ط§ظ„ط·ظ„ط¨ ط¨ظ†ط¬ط§ط­', order_rejected_message:'طھظ… ط±ظپط¶ ط§ظ„ط·ظ„ط¨',
    earnings_weekly:'ط§ظ„ط£ط³ط¨ظˆط¹ظٹ', earnings_monthly:'ط§ظ„ط´ظ‡ط±ظٹ',
    document_upload:'ط±ظپط¹ ظ…ط³طھظ†ط¯', vehicle_plate:'ط±ظ‚ظ… ط§ظ„ظ„ظˆط­ط©', vehicle_model:'ظ†ظˆط¹ ط§ظ„ظ…ط±ظƒط¨ط©',
    notification_mark_read:'طھط­ط¯ظٹط¯ ظƒظ…ظ‚ط±ظˆط،', settings_language:'ط§ظ„ظ„ط؛ط©', settings_theme:'ط§ظ„ظ…ط¸ظ‡ط±',
    settings_sounds:'ط§ظ„ط£طµظˆط§طھ', settings_notifications:'ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ',
    confirm_logout:'ظ‡ظ„ ط£ظ†طھ ظ…طھط£ظƒط¯ ظ…ظ† طھط³ط¬ظٹظ„ ط§ظ„ط®ط±ظˆط¬طں', no_documents:'ظ„ط§ طھظˆط¬ط¯ ظ…ط³طھظ†ط¯ط§طھ',
    no_vehicle_info:'ظ„ط§ طھظˆط¬ط¯ ظ…ط¹ظ„ظˆظ…ط§طھ ظ…ط±ظƒط¨ط©', withdraw_request_sent:'طھظ… ط¥ط±ط³ط§ظ„ ط·ظ„ط¨ ط§ظ„ط³ط­ط¨',
    transaction_debit:'ط®طµظ…', transaction_credit:'ط¥ظٹط¯ط§ط¹', order_details:'طھظپط§طµظٹظ„ ط§ظ„ط·ظ„ط¨',
    feature_unavailable:'ظ‡ط°ظ‡ ط§ظ„ظ…ظٹط²ط© ط؛ظٹط± ظ…طھط§ط­ط© ط­ط§ظ„ظٹظ‹ط§',
    driver_login:'طھط³ط¬ظٹظ„ ط¯ط®ظˆظ„ ط§ظ„ط³ط§ط¦ظ‚', driver_register_title:'طھط³ط¬ظٹظ„ ط³ط§ط¦ظ‚ ط¬ط¯ظٹط¯',
    driver_register_btn:'طھط³ط¬ظٹظ„', driver_register_success:'طھظ… ط§ظ„طھط³ط¬ظٹظ„ ط¨ظ†ط¬ط§ط­',
    no_account:'ظ„ظٹط³ ظ„ط¯ظٹظƒ ط­ط³ط§ط¨طں طھط³ط¬ظٹظ„', have_account:'ظ„ط¯ظٹظƒ ط­ط³ط§ط¨طں ط¯ط®ظˆظ„',
    name_label:'ط§ظ„ط§ط³ظ… ط§ظ„ظƒط§ظ…ظ„', phone_label:'ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ', vehicle_label:'ظ†ظˆط¹ ط§ظ„ظ…ط±ظƒط¨ط©',
    plate_label:'ط±ظ‚ظ… ط§ظ„ظ„ظˆط­ط©', vehicle_car:'ط³ظٹط§ط±ط©', vehicle_motorcycle:'ط¯ط±ط§ط¬ط© ظ†ط§ط±ظٹط©',
    vehicle_bicycle:'ط¯ط±ط§ط¬ط©', vehicle_scooter:'ط³ظƒظˆطھط±',
    fill_fields:'ط§ظ„ط±ط¬ط§ط، طھط¹ط¨ط¦ط© ط¬ظ…ظٹط¹ ط§ظ„ط­ظ‚ظˆظ„', email:'ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ', password:'ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±',
    login:'ط¯ط®ظˆظ„', na:'ط؛ظٹط± ظ…طھظˆظپط±', pending:'ظ‚ظٹط¯ ط§ظ„ط¥ط¬ط±ط§ط،',
    picked_up:'ط§ط³طھظ„ظ…طھ ط§ظ„ط·ظ„ط¨', on_the_way:'ظپظٹ ط§ظ„ط·ط±ظٹظ‚', delivered:'طھظ… ط§ظ„طھظˆطµظٹظ„',
    restaurant:'ط§ظ„ظ…ط·ط¹ظ…', customer:'ط§ظ„ط¹ظ…ظٹظ„',
    arabic:'ط§ظ„ط¹ط±ط¨ظٹط©', english:'English', german:'Deutsch',
    noscript_warning:'ظٹط¬ط¨ طھظپط¹ظٹظ„ JavaScript ظ„ط§ط³طھط®ط¯ط§ظ… ط§ظ„طھط·ط¨ظٹظ‚.',
    lang_ar:'AR', lang_en:'EN', lang_de:'DE'
  },
  en: {
    app_title:'Fairfood Price - Driver', loading:'Loadingâ€¦', locating:'Locatingâ€¦',
    online:'ًںں¢ Online', offline:'ًں”´ Offline', home:'Home', incoming_orders:'Incoming Orders',
    active_delivery:'Active Delivery', earnings:'Earnings', settings:'Settings',
    nav_home:'Home', nav_orders:'Orders', nav_delivery:'Delivery',
    nav_earnings:'Earnings', nav_settings:'Settings', nav_profile:'Profile', nav_wallet:'Wallet',
    no_new_orders:'No new orders currently', accept:'Accept', reject:'Reject',
    new_order:'New Order', today_earnings:'SAR', today_deliveries:'deliveries',
    offline_banner:'You are offline', reconnect_banner:'Reconnected',
    map_unavailable:'Map not available', navigate_google:'ًں—؛ï¸ڈ Google Maps',
    navigate_waze:'ًںڑ— Waze', call_customer:'ًں“‍ Call', chat_customer:'ًں’¬ Chat',
    emergency_support:'ًں†ک Emergency', close:'Close', back:'Back',
    estimated_time:'Estimated time', delivery_fee:'Delivery fee',
    pickup:'Pick up', dropoff:'Drop off',
    earnings_today:"Today's earnings", deliveries_today:'Deliveries today',
    error_network:'Network error', error_general:'Something went wrong', retry:'Retry',
    logout:'Log out', language:'Language', theme:'Theme', dark:'Dark', light:'Light',
    menu:'Menu', main_navigation:'Main navigation', no_active_order:'No active delivery',
    auth_welcome:'Welcome!', order_accepted:'Order accepted',
    session_expired:'Session expired', support_unavailable:'Support number not available',
    my_profile:'My Profile', total_deliveries:'Total Deliveries', weekly_earnings:'Weekly',
    monthly_earnings:'Monthly', documents:'Documents', vehicle_info:'Vehicle Info',
    notifications:'Notifications', orders_history:'Order History', wallet:'Wallet',
    dashboard:'Dashboard', wallet_balance:'Current Balance', withdraw:'Withdraw',
    transaction_history:'Transaction History', no_transactions:'No transactions',
    no_orders_history:'No order history', no_notifications:'No notifications',
    support:'Support', about:'About',
    type_message:'Type a message...', send:'Send', order_history:'Order History',
    amount:'Amount', distance:'Distance', status:'Status',
    delivery_sheet_title:'Active Delivery',
    order_accepted_message:'Order accepted successfully', order_rejected_message:'Order rejected',
    earnings_weekly:'Weekly', earnings_monthly:'Monthly',
    document_upload:'Upload Document', vehicle_plate:'Plate Number', vehicle_model:'Vehicle Model',
    notification_mark_read:'Mark as read', settings_language:'Language', settings_theme:'Theme',
    settings_sounds:'Sounds', settings_notifications:'Notifications',
    confirm_logout:'Are you sure you want to log out?', no_documents:'No documents',
    no_vehicle_info:'No vehicle information', withdraw_request_sent:'Withdrawal request sent',
    transaction_debit:'Debit', transaction_credit:'Credit', order_details:'Order Details',
    feature_unavailable:'This feature is currently unavailable',
    driver_login:'Driver Login', driver_register_title:'Register New Driver',
    driver_register_btn:'Register', driver_register_success:'Registration successful',
    no_account:"No account? Register", have_account:'Already have an account? Login',
    name_label:'Full Name', phone_label:'Phone Number', vehicle_label:'Vehicle Type',
    plate_label:'Plate Number', vehicle_car:'Car', vehicle_motorcycle:'Motorcycle',
    vehicle_bicycle:'Bicycle', vehicle_scooter:'Scooter',
    fill_fields:'Please fill in all fields', email:'Email', password:'Password',
    login:'Login', na:'N/A', pending:'Pending',
    picked_up:'Picked up', on_the_way:'On the way', delivered:'Delivered',
    restaurant:'Restaurant', customer:'Customer',
    arabic:'ط§ظ„ط¹ط±ط¨ظٹط©', english:'English', german:'Deutsch',
    noscript_warning:'Please enable JavaScript to use the app.',
    lang_ar:'AR', lang_en:'EN', lang_de:'DE'
  },
  de: {
    app_title:'Fairfood Price - Fahrer', loading:'Lأ¤dtâ€¦', locating:'Standort wird ermitteltâ€¦',
    online:'ًںں¢ Online', offline:'ًں”´ Offline', home:'Startseite', incoming_orders:'Neue Auftrأ¤ge',
    active_delivery:'Aktive Lieferung', earnings:'Verdienst', settings:'Einstellungen',
    nav_home:'Start', nav_orders:'Auftrأ¤ge', nav_delivery:'Lieferung',
    nav_earnings:'Verdienst', nav_settings:'Einstellungen', nav_profile:'Profil', nav_wallet:'Geldbأ¶rse',
    no_new_orders:'Keine neuen Auftrأ¤ge', accept:'Annehmen', reject:'Ablehnen',
    new_order:'Neuer Auftrag', today_earnings:'EUR', today_deliveries:'Lieferungen',
    offline_banner:'Sie sind offline', reconnect_banner:'Wieder verbunden',
    map_unavailable:'Karte nicht verfأ¼gbar', navigate_google:'ًں—؛ï¸ڈ Google Maps',
    navigate_waze:'ًںڑ— Waze', call_customer:'ًں“‍ Anrufen', chat_customer:'ًں’¬ Chat',
    emergency_support:'ًں†ک Notfall', close:'Schlieأںen', back:'Zurأ¼ck',
    estimated_time:'Voraussichtliche Zeit', delivery_fee:'Liefergebأ¼hr',
    pickup:'Abholung', dropoff:'Zustellung',
    earnings_today:'Heutiger Verdienst', deliveries_today:'Lieferungen heute',
    error_network:'Netzwerkfehler', error_general:'Ein Fehler ist aufgetreten', retry:'Wiederholen',
    logout:'Abmelden', language:'Sprache', theme:'Erscheinungsbild', dark:'Dunkel', light:'Hell',
    menu:'Menأ¼', main_navigation:'Hauptnavigation', no_active_order:'Keine aktive Lieferung',
    auth_welcome:'Willkommen!', order_accepted:'Auftrag angenommen',
    session_expired:'Sitzung abgelaufen', support_unavailable:'Supportnummer nicht verfأ¼gbar',
    my_profile:'Mein Profil', total_deliveries:'Gesamtlieferungen', weekly_earnings:'Wأ¶chentlich',
    monthly_earnings:'Monatlich', documents:'Dokumente', vehicle_info:'Fahrzeuginformation',
    notifications:'Benachrichtigungen', orders_history:'Bestellverlauf', wallet:'Geldbأ¶rse',
    dashboard:'Dashboard', wallet_balance:'Aktuelles Guthaben', withdraw:'Abheben',
    transaction_history:'Transaktionsverlauf', no_transactions:'Keine Transaktionen',
    no_orders_history:'Kein Bestellverlauf', no_notifications:'Keine Benachrichtigungen',
    support:'Support', about:'أœber',
    type_message:'Nachricht schreiben...', send:'Senden', order_history:'Bestellverlauf',
    amount:'Betrag', distance:'Entfernung', status:'Status',
    delivery_sheet_title:'Aktive Lieferung',
    order_accepted_message:'Auftrag angenommen', order_rejected_message:'Auftrag abgelehnt',
    earnings_weekly:'Wأ¶chentlich', earnings_monthly:'Monatlich',
    document_upload:'Dokument hochladen', vehicle_plate:'Kennzeichen', vehicle_model:'Fahrzeugmodell',
    notification_mark_read:'Als gelesen markieren', settings_language:'Sprache', settings_theme:'Erscheinungsbild',
    settings_sounds:'Tأ¶ne', settings_notifications:'Benachrichtigungen',
    confirm_logout:'Mأ¶chten Sie sich wirklich abmelden?', no_documents:'Keine Dokumente',
    no_vehicle_info:'Keine Fahrzeuginformationen', withdraw_request_sent:'Auszahlungsantrag gesendet',
    transaction_debit:'Belastung', transaction_credit:'Gutschrift', order_details:'Bestelldetails',
    feature_unavailable:'Diese Funktion ist derzeit nicht verfأ¼gbar',
    driver_login:'Fahrer-Login', driver_register_title:'Neuen Fahrer registrieren',
    driver_register_btn:'Registrieren', driver_register_success:'Registrierung erfolgreich',
    no_account:'Kein Konto? Registrieren', have_account:'Bereits Konto? Anmelden',
    name_label:'Vollstأ¤ndiger Name', phone_label:'Telefonnummer', vehicle_label:'Fahrzeugtyp',
    plate_label:'Kennzeichen', vehicle_car:'Auto', vehicle_motorcycle:'Motorrad',
    vehicle_bicycle:'Fahrrad', vehicle_scooter:'Roller',
    fill_fields:'Bitte fأ¼llen Sie alle Felder aus', email:'E-Mail', password:'Passwort',
    login:'Anmelden', na:'N/A', pending:'Ausstehend',
    picked_up:'Abgeholt', on_the_way:'Unterwegs', delivered:'Geliefert',
    restaurant:'Restaurant', customer:'Kunde',
    arabic:'ط§ظ„ط¹ط±ط¨ظٹط©', english:'English', german:'Deutsch',
    noscript_warning:'Bitte aktivieren Sie JavaScript, um die App zu nutzen.',
    lang_ar:'AR', lang_en:'EN', lang_de:'DE'
  }
};

function t(key) { return (TRANS[LANG] && TRANS[LANG][key]) || (TRANS.en && TRANS.en[key]) || key; }
function setLang(lang) {
  if (!TRANS[lang]) return;
  LANG = lang; ss('driver_lang', lang);
  document.documentElement.lang = lang;
  document.body.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(function(el) { var k = el.dataset.i18n; if (k) el.textContent = t(k); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) { var k = el.dataset.i18nPlaceholder; if (k) el.placeholder = t(k); });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(function(el) { var k = el.dataset.i18nAriaLabel; if (k) el.setAttribute('aria-label', t(k)); });
  document.querySelectorAll('.lang-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.lang === lang); });
  STATE.settings.language = lang;
}
function getCurrency() { return { ar:'SAR', en:'USD', de:'EUR' }[LANG] || 'SAR'; }
function formatPrice(cents, currencyCode) {
  try { return new Intl.NumberFormat('ar-SA', { style:'currency', currency: currencyCode || getCurrency(), minimumFractionDigits:0, maximumFractionDigits:2 }).format(cents / 100); }
  catch(e) { return (cents / 100).toFixed(2) + ' ' + (currencyCode || getCurrency()); }
}
function esc(str) { var d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

// ---- XHR API ----
function xhr(method, url, body, token, cb) {
  var x = new XMLHttpRequest();
  x.open(method, url, true);
  x.setRequestHeader('Content-Type', 'application/json');
  if (token) x.setRequestHeader('Authorization', 'Bearer ' + token);
  x.onreadystatechange = function() {
    if (x.readyState !== 4) return;
    try {
      var d = JSON.parse(x.responseText);
      if (x.status >= 200 && x.status < 300 && d.success !== false) { cb(null, d); }
      else { cb(new Error(d.message || (d.error && d.error.message) || 'HTTP ' + x.status), d); }
    } catch(e) { cb(new Error('Invalid response')); }
  };
  x.onerror = function() { cb(new Error(t('error_network'))); };
  x.send(body ? JSON.stringify(body) : null);
}

// ---- Toast & UI ----
function toast(msg, type) {
  var c = document.getElementById('toastContainer'); if (!c) return;
  var el = document.createElement('div'); el.className = 'toast toast-' + (type || 'success');
  el.textContent = msg; c.appendChild(el);
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
}
function openSheet(id) { var el = document.getElementById(id); if (el) el.classList.remove('is-hidden'); }
function closeSheet(id) { var el = document.getElementById(id); if (el) el.classList.add('is-hidden'); }
function openModal(id) { var el = document.getElementById(id); if (el) el.classList.remove('is-hidden'); }
function closeModal(id) { var el = document.getElementById(id); if (el) el.classList.add('is-hidden'); }
function updateBadge(id, count) {
  var badge = document.getElementById(id); if (!badge) return;
  badge.textContent = count; count > 0 ? badge.classList.remove('is-hidden') : badge.classList.add('is-hidden');
}
function announce(msg) {
  var region = document.getElementById('ariaLiveRegion');
  if (region) region.textContent = msg;
}

// ---- Navigation ----
var _screenMap = {
  home:'homeScreen', orders:'ordersScreen', delivery:'deliveryScreen',
  earnings:'earningsScreen', wallet:'walletScreen', profile:'profileScreen',
  settings:'settingsScreen', documents:'documentsScreen', vehicleInfo:'vehicleInfoScreen',
  notifications:'notificationsScreen', ordersHistory:'ordersHistoryScreen'
};

function navigate(screen) {
  STATE.currentScreen = screen;
  closeSheet('activeDeliverySheet');
  closeModal('incomingOrderModal');
  closeModal('chatModal');
  closeModal('supportModal');
  closeModal('aboutModal');
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.screen === screen); });
  var el = document.getElementById(_screenMap[screen]);
  if (el) el.classList.add('active');
  var fn = { home:showHome, orders:showOrders, delivery:showDelivery, earnings:showEarnings,
    wallet:showWallet, profile:showProfile, settings:showSettings, documents:showDocuments,
    vehicleInfo:showVehicleInfo, notifications:showNotifications, ordersHistory:showOrdersHistory }[screen];
  if (fn) fn();
  if (screen === 'home' && window.FairfoodMap && STATE.map) {
    clearTimeout(STATE._mapTimer);
    STATE._mapTimer = setTimeout(function() { if (STATE.map) STATE.map.invalidateSize(); }, 200);
  }
}

// ---- Screen: Home ----
function showHome() {
  if (!STATE.map && window.FairfoodMap) {
    initMap();
  }
  updateOnlineBtn();
  loadQuickStats();
  if (STATE.activeDelivery) {
    openSheet('activeDeliverySheet');
    renderActiveDeliverySheet(STATE.activeDelivery);
  }
}

function initMap() {
  if (!window.FairfoodMap) return;
  window.FairfoodMap.init('driverMap', { hideZoomControl: true }).then(function(map) {
    if (!map) { document.getElementById('mapFallback') && (document.getElementById('mapFallback').classList.remove('is-hidden')); return; }
    STATE.map = map;
    window.FairfoodMap.getCurrentPosition().then(function(pos) {
      STATE.userLocation = { lat: pos.lat, lng: pos.lng };
      map.setView([pos.lat, pos.lng], 14);
      document.getElementById('mapFallback') && document.getElementById('mapFallback').classList.add('is-hidden');
      window.FairfoodMap.addMarker('driver_user', pos.lat, pos.lng, '', 'user');
    });
    startGpsTracking();
  });
}

function startGpsTracking() {
  if (!STATE.token || !window.FairfoodMap) return;
  window.FairfoodMap.startWatching(function(pos) {
    STATE.userLocation = { lat: pos.lat, lng: pos.lng };
    document.getElementById('mapFallback') && document.getElementById('mapFallback').classList.add('is-hidden');
    window.FairfoodMap.addMarker('driver_user', pos.lat, pos.lng, '', 'user');
    xhr('POST', API_BASE + '/driver/location', { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy || 0 }, STATE.token, function() {});
  });
}

function stopGpsTracking() {
  if (window.FairfoodMap) window.FairfoodMap.stopWatching();
}

function updateOnlineBtn() {
  var btn = document.getElementById('toggleOnlineBtn');
  if (!btn) return;
  btn.className = STATE.isOnline ? 'btn btn-success btn-block' : 'btn btn-danger btn-block';
  btn.innerHTML = '<span>' + t(STATE.isOnline ? 'online' : 'offline') + '</span>';
}

function loadQuickStats() {
  if (!STATE.token) return;
  xhr('GET', API_BASE + '/driver/earnings', null, STATE.token, function(er, d) {
    if (er) return;
    var data = d.data || d || {};
    var currency = getCurrency();
    var el = document.getElementById('quickStats');
    if (el) el.innerHTML = '<div class="stat-badge">ًں’° ' + formatPrice(data.today_earnings || 0, currency) + '</div><div class="stat-badge">ًں“¦ ' + (data.today_deliveries || 0) + ' ' + t('today_deliveries') + '</div>';
  });
}

// ---- Screen: Profile ----
function showProfile() {
  xhr('GET', API_BASE + '/driver/profile?_=' + Date.now(), null, STATE.token, function(er, d) {
    if (er) return;
    var u = d.user || d.data || d;
    STATE.user = u;
    document.getElementById('driverName') && (document.getElementById('driverName').textContent = u.name || '---');
    document.getElementById('driverRating') && (document.getElementById('driverRating').textContent = (u.rating || 0).toFixed(1));
    document.getElementById('driverVehicleNumber') && (document.getElementById('driverVehicleNumber').textContent = u.plate_number || u.plateNumber || '---');
    document.getElementById('driverVehicleType') && (document.getElementById('driverVehicleType').textContent = u.vehicle || u.vehicle_type || '---');
    loadProfileStats();
  });
}

function loadProfileStats() {
  xhr('GET', API_BASE + '/driver/earnings?_=' + Date.now(), null, STATE.token, function(er, d) {
    if (er) return;
    var data = d.data || d || {};
    document.getElementById('statDeliveries') && (document.getElementById('statDeliveries').textContent = data.total_deliveries || data.today_deliveries || 0);
    var currency = getCurrency();
    document.getElementById('statToday') && (document.getElementById('statToday').textContent = formatPrice(data.today_earnings || 0, currency));
    document.getElementById('statWeekly') && (document.getElementById('statWeekly').textContent = formatPrice(data.weekly_earnings || 0, currency));
    document.getElementById('statMonthly') && (document.getElementById('statMonthly').textContent = formatPrice(data.monthly_earnings || 0, currency));
  });
}

// ---- Screen: Earnings ----
function showEarnings() {
  var container = document.getElementById('earningsContainer');
  xhr('GET', API_BASE + '/driver/earnings?_=' + Date.now(), null, STATE.token, function(er, d) {
    if (er) { container.innerHTML = '<div class="empty-state">' + t('error_network') + '</div>'; return; }
    var data = d.data || d || {};
    var currency = getCurrency();
    container.innerHTML = '<div class="earnings-card"><p><strong>' + t('earnings_today') + ':</strong> ' + formatPrice(data.today_earnings || 0, currency) + '</p><p><strong>' + t('earnings_weekly') + ':</strong> ' + formatPrice(data.weekly_earnings || 0, currency) + '</p><p><strong>' + t('earnings_monthly') + ':</strong> ' + formatPrice(data.monthly_earnings || 0, currency) + '</p><p><strong>' + t('today_deliveries') + ':</strong> ' + (data.today_deliveries || 0) + '</p></div>';
  });
}

// ---- Screen: Wallet ----
function showWallet() {
  xhr('GET', API_BASE + '/driver/wallet?_=' + Date.now(), null, STATE.token, function(er, d) {
    if (er) { document.getElementById('walletBalance') && (document.getElementById('walletBalance').textContent = '0.00 ' + t('today_earnings')); return; }
    var data = d.data || d || {};
    var currency = getCurrency();
    document.getElementById('walletBalance') && (document.getElementById('walletBalance').textContent = formatPrice(data.balance_cents || 0, currency));
    var list = data.transactions || [];
    var container = document.getElementById('transactionsList');
    var empty = document.getElementById('emptyTransactions');
    if (!list.length) {
      if (empty) empty.classList.remove('is-hidden');
      if (container) container.innerHTML = '';
    } else {
      if (empty) empty.classList.add('is-hidden');
      if (container) container.innerHTML = list.map(function(tx) {
        return '<div class="order-card"><div class="order-detail"><p>' + esc(tx.description || '') + '</p><small>' + formatPrice(tx.amount_cents || 0, currency) + ' | ' + new Date(tx.created_at).toLocaleDateString() + '</small></div></div>';
      }).join('');
    }
  });
}

// ---- Screen: Orders History ----
function showOrdersHistory() {
  var container = document.getElementById('ordersHistoryList');
  var empty = document.getElementById('emptyOrdersHistory');
  xhr('GET', API_BASE + '/driver/orders/history?_=' + Date.now(), null, STATE.token, function(er, d) {
    if (er) { if (empty) empty.classList.remove('is-hidden'); container.innerHTML = ''; return; }
    var list = d.data || d.orders || (Array.isArray(d) ? d : []);
    if (!Array.isArray(list)) list = [];
    if (!list.length) {
      if (empty) empty.classList.remove('is-hidden');
      container.innerHTML = '';
    } else {
      if (empty) empty.classList.add('is-hidden');
      container.innerHTML = list.map(function(o) {
        return '<div class="order-card"><div class="order-detail"><h4>' + esc(o.restaurant_name || '') + '</h4><p>' + esc(o.delivery_address || o.restaurant_address || '') + '</p><p>' + new Date(o.updated_at || o.created_at).toLocaleDateString() + '</p><span class="status-badge">' + (o.status || '') + '</span></div></div>';
      }).join('');
    }
  });
}

// ---- Screen: Documents ----
function showDocuments() {
  var container = document.getElementById('documentsContent');
  xhr('GET', API_BASE + '/driver/documents?_=' + Date.now(), null, STATE.token, function(er, d) {
    if (er) { container.innerHTML = '<div class="empty-state">' + t('no_documents') + '</div>'; return; }
    var list = d.data || d || [];
    if (!Array.isArray(list) || !list.length) {
      container.innerHTML = '<div class="empty-state">' + t('no_documents') + '</div>';
    } else {
      container.innerHTML = list.map(function(doc) {
        return '<div class="order-card"><div class="order-detail"><h4>' + esc(doc.type || doc.name || '') + '</h4><p>' + (doc.status || t('pending')) + '</p></div></div>';
      }).join('');
    }
  });
}

// ---- Screen: Vehicle Info ----
function showVehicleInfo() {
  var container = document.getElementById('vehicleInfoContent');
  xhr('GET', API_BASE + '/driver/vehicle?_=' + Date.now(), null, STATE.token, function(er, d) {
    if (er) { container.innerHTML = '<div class="empty-state">' + t('no_vehicle_info') + '</div>'; return; }
    var v = d.data || d || {};
    if (!v.plate_number && !v.vehicle_model && !v.vehicle) {
      container.innerHTML = '<div class="empty-state">' + t('no_vehicle_info') + '</div>';
    } else {
      container.innerHTML = '<div class="earnings-card"><p><strong>' + t('vehicle_plate') + ':</strong> ' + esc(v.plate_number || t('na')) + '</p><p><strong>' + t('vehicle_model') + ':</strong> ' + esc(v.vehicle_model || v.vehicle || t('na')) + '</p></div>';
    }
  });
}

// ---- Screen: Notifications ----
function showNotifications() {
  var container = document.getElementById('notificationsList');
  var empty = document.getElementById('emptyNotifications');
  xhr('GET', API_BASE + '/driver/notifications?_=' + Date.now(), null, STATE.token, function(er, d) {
    if (er) { if (empty) empty.classList.remove('is-hidden'); container.innerHTML = ''; return; }
    var list = d.data || d || [];
    if (!Array.isArray(list) || !list.length) {
      if (empty) empty.classList.remove('is-hidden');
      container.innerHTML = '';
    } else {
      if (empty) empty.classList.add('is-hidden');
      container.innerHTML = list.map(function(n) {
        return '<div class="order-card"><div class="order-detail"><h4>' + esc(n.title || '') + '</h4><p>' + esc(n.body || n.message || '') + '</p><small>' + new Date(n.created_at).toLocaleDateString() + '</small></div></div>';
      }).join('');
    }
  });
}

// ---- Screen: Settings ----
function showSettings() {
  var container = document.getElementById('settingsContent');
  container.innerHTML = '<div class="settings-item"><span>' + t('settings_language') + '</span><select id="langSelect"><option value="ar" ' + (LANG === 'ar' ? 'selected' : '') + '>' + t('arabic') + '</option><option value="en" ' + (LANG === 'en' ? 'selected' : '') + '>' + t('english') + '</option><option value="de" ' + (LANG === 'de' ? 'selected' : '') + '>' + t('german') + '</option></select></div><div class="settings-item"><span>' + t('settings_theme') + '</span><select id="themeSelect"><option value="light" ' + (STATE.settings.theme === 'light' ? 'selected' : '') + '>' + t('light') + '</option><option value="dark" ' + (STATE.settings.theme === 'dark' ? 'selected' : '') + '>' + t('dark') + '</option></select></div><div class="settings-item"><span>' + t('settings_sounds') + '</span><input type="checkbox" id="soundsCheck" ' + (STATE.settings.sounds ? 'checked' : '') + '></div><button class="btn btn-danger btn-block" data-action="logout">' + t('logout') + '</button>';
}

// ---- Auth Functions (Standalone XHR - on window) ----
window.authLogin = function() {
  var btn = document.getElementById('authLoginBtn');
  if (!btn || btn.disabled) return false;
  btn.disabled = true; btn.textContent = '...';
  var email = (document.getElementById('authEmail') && document.getElementById('authEmail').value || '').trim();
  var pass = document.getElementById('authPassword') && document.getElementById('authPassword').value || '';
  var err = document.getElementById('authError');
  if (err) err.classList.add('is-hidden');
  if (!email || !pass) {
    if (err) { err.textContent = t('fill_fields'); err.classList.remove('is-hidden'); }
    btn.disabled = false; btn.textContent = t('login'); return false;
  }
  xhr('POST', API_BASE + '/driver/auth/login', { email: email, password: pass }, null, function(er, d) {
    if (er) {
      if (err) { err.textContent = d ? (d.message || t('error_network')) : t('error_network'); err.classList.remove('is-hidden'); }
    } else if (d.success && (d.data && d.data.token || d.token)) {
      var tok = d.data && d.data.token || d.token;
      STATE.token = tok; ss('driver_token', tok);
      document.getElementById('authSheet') && document.getElementById('authSheet').classList.add('is-hidden');
      if (err) err.classList.add('is-hidden');
      initApp();
    } else {
      if (err) { err.textContent = d.message || t('error_network'); err.classList.remove('is-hidden'); }
    }
    btn.disabled = false; btn.textContent = t('login');
  });
  return false;
};

window.authRegister = function() {
  var btn = document.getElementById('doRegisterBtn');
  if (!btn || btn.disabled) return false;
  btn.disabled = true; btn.textContent = '...';
  var name = (document.getElementById('regName') && document.getElementById('regName').value || '').trim();
  var email = (document.getElementById('regEmail') && document.getElementById('regEmail').value || '').trim();
  var phone = document.getElementById('regPhone') ? document.getElementById('regPhone').value.trim() : '';
  var password = document.getElementById('regPassword') && document.getElementById('regPassword').value || '';
  var vehicle = document.getElementById('regVehicle') ? document.getElementById('regVehicle').value : 'car';
  var plate = document.getElementById('regPlate') ? document.getElementById('regPlate').value.trim() : '';
  var err = document.getElementById('authError');
  if (err) err.classList.add('is-hidden');
  if (!name || !email || !password) {
    if (err) { err.textContent = t('fill_fields'); err.classList.remove('is-hidden'); }
    btn.disabled = false; btn.textContent = t('driver_register_btn'); return false;
  }
  xhr('POST', API_BASE + '/auth/register', { role:'driver', name:name, email:email, phone:phone, password:password, vehicle:vehicle, plateNumber:plate }, null, function(er, d) {
    if (er) {
      if (err) { err.textContent = d ? (d.message || t('error_network')) : t('error_network'); err.classList.remove('is-hidden'); }
    } else if (d.success && (d.data && d.data.token || d.token)) {
      var tok = d.data && d.data.token || d.token;
      STATE.token = tok; ss('driver_token', tok);
      document.getElementById('authSheet') && document.getElementById('authSheet').classList.add('is-hidden');
      toast(t('driver_register_success'), 'success');
      initApp();
    } else {
      if (err) { err.textContent = d.message || t('error_network'); err.classList.remove('is-hidden'); }
    }
    btn.disabled = false; btn.textContent = t('driver_register_btn');
  });
  return false;
};

window.authShowRegister = function() {
  document.getElementById('authLoginForm') && document.getElementById('authLoginForm').classList.add('is-hidden');
  document.getElementById('authRegisterForm') && document.getElementById('authRegisterForm').classList.remove('is-hidden');
  var e = document.getElementById('authError'); if (e) e.classList.add('is-hidden');
  return false;
};

window.authShowLogin = function() {
  document.getElementById('authRegisterForm') && document.getElementById('authRegisterForm').classList.add('is-hidden');
  document.getElementById('authLoginForm') && document.getElementById('authLoginForm').classList.remove('is-hidden');
  var e = document.getElementById('authError'); if (e) e.classList.add('is-hidden');
  return false;
};

window.authLogout = function() {
  if (!confirm(t('confirm_logout'))) return;
  stopPolling(); stopGpsTracking();
  if (window.FairfoodMap) window.FairfoodMap.destroy('driverMap');
  STATE.token = null; STATE.user = null; STATE.activeDelivery = null; STATE.isOnline = false;
  sr('driver_token'); ss('driver_online', 'false');
  document.getElementById('authSheet') && document.getElementById('authSheet').classList.remove('is-hidden');
  document.getElementById('authLoginForm') && document.getElementById('authLoginForm').classList.remove('is-hidden');
  document.getElementById('authRegisterForm') && document.getElementById('authRegisterForm').classList.add('is-hidden');
  navigate('home');
  toast(t('logout'), 'success');
};

// ---- Order Actions (ظپظٹ driver/delivery.js) ----
function toggleOnline() {
  var newState = !STATE.isOnline;
  xhr('POST', API_BASE + '/driver/status', { online: newState }, STATE.token, function(er, d) {
    if (er) { toast(er.message || t('error_network'), 'error'); return; }
    STATE.isOnline = newState;
    ss('driver_online', newState ? 'true' : 'false');
    updateOnlineBtn();
  });
}

// ---- Polling ----
function startPolling() {
  stopPolling();
  _pollTimer = setInterval(function() {
    if (!STATE.token) return;
    xhr('GET', API_BASE + '/driver/orders/available?_=' + Date.now(), null, STATE.token, function(er, d) {
      if (er) return;
      var list = d.orders || d.data || (Array.isArray(d) ? d : []);
      if (!Array.isArray(list)) list = [];
      var incomingIds = new Set();
      list.forEach(function(o) { incomingIds.add(o.id); });
      list.forEach(function(o) {
        if (!_knownOrderIds.has(o.id)) {
          announce(t('new_order'));
          showIncomingModal(o);
          try { var snd = document.getElementById('soundNewOrder'); if (snd) { var p = snd.play(); if (p && p.catch) p.catch(function(){}); } } catch(e) {}
        }
      });
      STATE.orders = list;
      _knownOrderIds = incomingIds;
      updateBadge('ordersBadge', list.length);
    });
  }, 15000);

  _activePollTimer = setInterval(function() {
    if (!STATE.token) return;
    if (STATE.activeDelivery) return;
    xhr('GET', API_BASE + '/driver/orders/current?_=' + Date.now(), null, STATE.token, function(er, d) {
      if (er) return;
      var list = d.orders || d.data || (Array.isArray(d) ? d : []);
      if (Array.isArray(list) && list.length > 0) {
        STATE.activeDelivery = list[0];
        if (['home', 'delivery'].indexOf(STATE.currentScreen) >= 0) {
          if (STATE.currentScreen === 'home') showHome();
          else showDelivery();
        }
      }
    });
  }, 10000);
}

function stopPolling() {
  clearInterval(_pollTimer); _pollTimer = null;
  clearInterval(_activePollTimer); _activePollTimer = null;
}

// ---- Event Delegation ----
function initEvents() {
  document.addEventListener('click', function(e) {
    var target = e.target;
    var btn = target.closest ? target.closest('[data-action]') : null;
    if (!btn) {
      if (target.id === 'authLoginBtn' || target.getAttribute('onclick')) return;
      return;
    }
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    if (action === 'accept') { closeModal('incomingOrderModal'); acceptOrder(id); }
    else if (action === 'reject') { closeModal('incomingOrderModal'); rejectOrder(id); }
    else if (action === 'picked-up') { pickedUp(id); }
    else if (action === 'on-the-way') { onTheWay(id); }
    else if (action === 'delivered') { delivered(id); }
    else if (action === 'logout') { window.authLogout(); }
    else if (action === 'theme') {
      var newTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', newTheme);
      STATE.settings.theme = newTheme;
      ss('driver_theme', newTheme);
    }
    else if (action === 'support') { openModal('supportModal'); }
    else if (action === 'about') { openModal('aboutModal'); }
    else if (action === 'dashboard') { navigate('home'); }
  });

  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { navigate(btn.dataset.screen); });
  });
  document.querySelectorAll('.back-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { navigate(btn.dataset.screen || 'home'); });
  });
  var menuBtn = document.getElementById('menuBtn');
  if (menuBtn) menuBtn.addEventListener('click', function() { navigate('profile'); });
  var toggleBtn = document.getElementById('toggleOnlineBtn');
  if (toggleBtn) toggleBtn.addEventListener('click', toggleOnline);

  document.getElementById('closeDeliverySheetBtn') && document.getElementById('closeDeliverySheetBtn').addEventListener('click', function() { closeSheet('activeDeliverySheet'); });
  document.getElementById('closeChatModalBtn') && document.getElementById('closeChatModalBtn').addEventListener('click', function() { closeModal('chatModal'); });
  document.getElementById('closeSupportModalBtn') && document.getElementById('closeSupportModalBtn').addEventListener('click', function() { closeModal('supportModal'); });
  document.getElementById('closeAboutModalBtn') && document.getElementById('closeAboutModalBtn').addEventListener('click', function() { closeModal('aboutModal'); });

  document.querySelectorAll('[data-lang]').forEach(function(btn) {
    btn.addEventListener('click', function() { setLang(btn.dataset.lang); });
  });

  document.querySelectorAll('.menu-item[data-screen]').forEach(function(item) {
    item.addEventListener('click', function() { navigate(item.dataset.screen); });
  });

  document.addEventListener('change', function(e) {
    if (e.target.id === 'langSelect') { setLang(e.target.value); }
    else if (e.target.id === 'themeSelect') {
      document.body.setAttribute('data-theme', e.target.value);
      STATE.settings.theme = e.target.value;
      ss('driver_theme', e.target.value);
    }
    else if (e.target.id === 'soundsCheck') {
      STATE.settings.sounds = e.target.checked;
      ss('driver_sounds', e.target.checked);
    }
  });

  document.getElementById('sendMessageBtn') && document.getElementById('sendMessageBtn').addEventListener('click', function() { toast(t('feature_unavailable'), 'info'); });
  document.getElementById('chatCustomerBtn') && document.getElementById('chatCustomerBtn').addEventListener('click', function() { openModal('chatModal'); });
  document.getElementById('emergencySupportBtn') && document.getElementById('emergencySupportBtn').addEventListener('click', function() {
    var phone = window.APP_CONFIG && window.APP_CONFIG.supportPhone;
    if (phone) { window.location.href = 'tel:' + phone; }
    else { toast(t('support_unavailable'), 'info'); }
  });

  window.addEventListener('online', function() {
    var rb = document.getElementById('reconnectBanner');
    if (rb) rb.classList.remove('is-hidden');
    var ob = document.getElementById('offlineBanner');
    if (ob) ob.classList.add('is-hidden');
    clearTimeout(STATE._bannerTimer);
    STATE._bannerTimer = setTimeout(function() {
      if (rb) rb.classList.add('is-hidden');
    }, 3000);
  });
  window.addEventListener('offline', function() {
    document.getElementById('offlineBanner') && document.getElementById('offlineBanner').classList.remove('is-hidden');
    document.getElementById('reconnectBanner') && document.getElementById('reconnectBanner').classList.add('is-hidden');
  });
}

// ---- Bootstrap ----
function initApp() {
  setLang(LANG);
  document.body.setAttribute('data-theme', STATE.settings.theme);
  if (STATE.token) {
    startPolling();
    navigate('home');
  }
}

function boot() {
  var loader = document.getElementById('appLoader');
  var app = document.getElementById('app');
  if (loader) loader.classList.add('is-hidden');
  if (app) app.classList.remove('app-loading');

  if (!window.FairfoodMap) {
    console.error('FairfoodMap not loaded. Ensure shared/map-service.js is loaded first.');
  }

  initEvents();
  var tok = sg('driver_token');
  if (tok) {
    STATE.token = tok;
    initApp();
  } else {
    document.getElementById('authSheet') && document.getElementById('authSheet').classList.remove('is-hidden');
  }
}

document.addEventListener('DOMContentLoaded', boot);
