package com.chainshift.game;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Draw behind the system bars on every Android version; the page pads itself
        // with env(safe-area-inset-*) (see SystemBars in capacitor.config.json).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
