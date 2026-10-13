package dev.midscene.scrollprobe;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.viewpager.widget.PagerAdapter;
import androidx.viewpager.widget.ViewPager;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native controls and telemetry only. The host SDK supplies all gestures. */
public class MainActivity extends Activity {
    private final Handler handler = new Handler();
    private final JSONArray samples = new JSONArray();
    private final long startedAt = System.currentTimeMillis();
    private ViewGroup scroll;
    private TextView status;
    private String mode;
    private int initial;
    private int pageOffset;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        mode = getIntent().getStringExtra("mode");
        if (mode == null) mode = "vertical";
        FrameLayout root = new FrameLayout(this);
        setContentView(root);
        root.post(() -> setup(root));
    }

    private TextView cell(String text, int index) {
        TextView cell = new TextView(this);
        cell.setText(text);
        cell.setTextSize(24);
        cell.setGravity(Gravity.CENTER);
        cell.setBackgroundColor(index % 2 == 0 ? 0xffd9efff : 0xffffffff);
        return cell;
    }

    private void setup(FrameLayout root) {
        int width = root.getWidth();
        int height = root.getHeight();
        boolean horizontal = mode.equals("horizontal");
        if (horizontal) {
            ViewPager pager = new ViewPager(this);
            scroll = pager;
            pager.setAdapter(new PagerAdapter() {
                @Override
                public int getCount() { return 12; }
                @Override
                public boolean isViewFromObject(View view, Object item) { return view == item; }
                @Override
                public Object instantiateItem(ViewGroup container, int position) {
                    TextView page = cell("Page " + position, position);
                    container.addView(page);
                    return page;
                }
                @Override
                public void destroyItem(ViewGroup container, int position, Object item) {
                    container.removeView((View) item);
                }
            });
            pager.addOnPageChangeListener(new ViewPager.SimpleOnPageChangeListener() {
                @Override
                public void onPageScrolled(int position, float offset, int pixels) {
                    // ViewPager may rebase scrollX as pages are recycled.
                    pageOffset = position * width + pixels;
                }
            });
            initial = width * 4;
            pageOffset = initial;
            root.addView(scroll, new FrameLayout.LayoutParams(width, height));
            pager.setCurrentItem(4, false);
        } else {
            ScrollView list = new ScrollView(this);
            scroll = list;
            LinearLayout content = new LinearLayout(this);
            content.setOrientation(LinearLayout.VERTICAL);
            int rows = (int) Math.ceil(height * 12.0 / 80);
            for (int index = 0; index < rows; index++) {
                content.addView(cell("Row " + index, index),
                        new LinearLayout.LayoutParams(width, 80));
            }
            list.addView(content);
            root.addView(scroll, new FrameLayout.LayoutParams(width, height));
            initial = mode.equals("top") ? 0
                    : mode.equals("bottom") ? rows * 80 - height : height * 3;
            scroll.post(() -> scroll.scrollTo(0, initial));
        }
        status = new TextView(this);
        status.setBackgroundColor(0xffffff00);
        FrameLayout.LayoutParams label = new FrameLayout.LayoutParams(width, 65);
        label.topMargin = height - 110;
        root.addView(status, label);
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                record(width, height);
                handler.postDelayed(this, 50);
            }
        }, 200);
    }

    private void record(int width, int height) {
        int x = scroll instanceof ViewPager ? pageOffset : scroll.getScrollX();
        int y = scroll.getScrollY();
        try {
            samples.put(new JSONObject()
                    .put("t", (System.currentTimeMillis() - startedAt) / 1000.0)
                    .put("x", x).put("y", y));
            JSONObject data = new JSONObject().put("mode", mode)
                    .put("width", width).put("height", height).put("initial", initial)
                    .put("x", x).put("y", y).put("samples", samples);
            try (FileOutputStream file = openFileOutput("metrics.json", 0)) {
                file.write(data.toString().getBytes(StandardCharsets.UTF_8));
            }
            status.setText(mode + " x=" + x + " y=" + y
                    + "\ninitial=" + initial + " screen=" + width + "x" + height);
        } catch (Exception error) {
            throw new RuntimeException("Cannot write scroll fixture measurements", error);
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
