package se.jagemyr.te;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Te som fristående app: visar Te-appen (assets/te) i en WebView. Sidan känner igen
 * bryggan TeNative och sparar då listan och inställningarna här i telefonen
 * (SharedPreferences) i stället för i Standard Notes.
 *
 * Skriven utan lambdas och utan AndroidX, så att den kan byggas med javac och dx direkt
 * (se build.sh).
 */
public class MainActivity extends Activity {

    /** Sidan känner igen bryggan TeNative och går då över till fristående läge. */
    private static final String START_URL = "file:///android_asset/te/index.html";
    private static final String ASSET_PREFIX = "file:///android_asset/";

    /** View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR (API 26), som värde eftersom appen byggs mot API 23. */
    private static final int LIGHT_NAVIGATION_BAR = 0x10;

    private WebView web;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("te", Context.MODE_PRIVATE);
        styleSystemBars();

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Timerns pip ska kunna spelas när timern startas, utan extra tryck.
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowContentAccess(false);

        web.addJavascriptInterface(new Bridge(), "TeNative");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith(ASSET_PREFIX)) return false;
                // Länkar ut från appen öppnas i webbläsaren.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (ActivityNotFoundException e) {
                    // Ingen app kan öppna länken.
                }
                return true;
            }
        });

        setContentView(web);
        web.loadUrl(START_URL);
    }

    /** Ljusa system­fält med mörka ikoner, som sidan. */
    private void styleSystemBars() {
        Window w = getWindow();
        View decor = w.getDecorView();
        int flags = decor.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= 26) {
            flags |= LIGHT_NAVIGATION_BAR;
        } else {
            // Före Android 8 går navigationsfältets ikoner inte att göra mörka.
            w.setNavigationBarColor(Color.BLACK);
        }
        decor.setSystemUiVisibility(flags);
    }

    /** Tillbaka stänger först timern, Text-panelen, sökningen eller det öppna teet (window.teBack). */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.teBack && window.teBack()) ? 'handled' : ''", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value == null || !value.contains("handled")) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("TeNative");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** Det sidan når som window.TeNative. Anropen kommer på en egen tråd, inte UI-tråden. */
    public class Bridge {

        @JavascriptInterface
        public String load(String key) {
            return prefs.getString(key, null);
        }

        /** Sparar direkt till disk; tom text tar bort nyckeln. */
        @JavascriptInterface
        public void save(String key, String value) {
            SharedPreferences.Editor e = prefs.edit();
            if (value == null || value.length() == 0) e.remove(key); else e.putString(key, value);
            e.commit();
        }

        /** Skärmen hålls tänd medan timern är öppen. */
        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                }
            });
        }

        @JavascriptInterface
        public void copy(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Te", text));
                }
            });
        }
    }
}
