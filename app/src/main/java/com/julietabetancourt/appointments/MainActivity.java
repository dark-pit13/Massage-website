package com.julietabetancourt.appointments;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.Toast;

/**
 * A thin, locked-down shell around the Appointments web app.
 *
 * It shows one site and nothing else: anything off that host, and every tel:,
 * mailto: or sms: link, is handed to the phone's own apps. The web app itself
 * does all the work — this class only has to keep the sign-in cookie, survive
 * the back button, and say something sensible when there is no connection.
 */
public class MainActivity extends Activity {

    private WebView web;
    private View offline;
    private String appUrl;
    private String appHost;
    /** Set when the current page failed to load, so onPageFinished knows not to reveal it. */
    private boolean loadFailed;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        appUrl = getString(R.string.app_url);
        appHost = Uri.parse(appUrl).getHost();

        web = findViewById(R.id.web);
        offline = findViewById(R.id.offline);
        Button retry = findViewById(R.id.retry);
        retry.setOnClickListener(v -> load());

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " AppointmentsApp/1.0");

        // The sign-in session lives in a cookie, so cookies must be kept. Third
        // party cookies stay off: the app only ever talks to its own site.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, false);

        web.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                loadFailed = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!loadFailed) {
                    offline.setVisibility(View.GONE);
                    web.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Only a failure of the page itself is worth a full-screen message;
                // a single missing image is not.
                if (request.isForMainFrame()) {
                    loadFailed = true;
                    showOffline();
                }
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            load();
        }
    }

    /** Loads the configured page, or complains clearly if it was never filled in. */
    private void load() {
        if (appHost == null || appHost.isEmpty() || appHost.contains("YOUR-DOMAIN")) {
            showOffline();
            Toast.makeText(this, R.string.url_not_set, Toast.LENGTH_LONG).show();
            return;
        }
        loadFailed = false;
        offline.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        web.loadUrl(appUrl);
    }

    private void showOffline() {
        web.setVisibility(View.GONE);
        offline.setVisibility(View.VISIBLE);
    }

    /**
     * @return true when the URL was handed to another app, false to let the
     *         WebView load it.
     */
    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();

        if (scheme.equals("tel") || scheme.equals("sms")) {
            return openExternally(new Intent(Intent.ACTION_DIAL, uri));
        }
        if (scheme.equals("mailto")) {
            return openExternally(new Intent(Intent.ACTION_SENDTO, uri));
        }
        if (scheme.equals("https") && appHost != null && appHost.equalsIgnoreCase(uri.getHost())) {
            return false; // our own site: keep it in the app
        }
        if (scheme.equals("http") || scheme.equals("https")) {
            return openExternally(new Intent(Intent.ACTION_VIEW, uri)); // anywhere else: the browser
        }
        return true; // unknown scheme: ignore rather than crash
    }

    private boolean openExternally(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException missing) {
            Toast.makeText(this, R.string.external_failed, Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        web.onPause();
        web.pauseTimers();
        // Write cookies out now, so a sign-in survives the app being closed.
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.resumeTimers();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        CookieManager.getInstance().flush();
        super.onDestroy();
    }
}
