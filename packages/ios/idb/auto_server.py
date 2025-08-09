from flask import Flask, request, jsonify
import pyautogui
import time
import traceback
import json
import sys
import subprocess
import os

app = Flask(__name__)

# Configure pyautogui
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.1

def execute_applescript(script):
    """Execute AppleScript command"""
    try:
        result = subprocess.run(['osascript', '-e', script], 
                              capture_output=True, text=True, timeout=5)
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)

# iOS device configuration
ios_config = {
    "enabled": False,
    "mirror_x": 0,
    "mirror_y": 0,
    "mirror_width": 0,
    "mirror_height": 0,
    "ios_aspect_ratio": 2.17,  # Default iPhone ratio (852/393)
    "estimated_ios_width": 393,
    "estimated_ios_height": 852
}

def setup_ios_mapping(mirror_x, mirror_y, mirror_width, mirror_height):
    """Setup coordinate mapping for iOS device mirroring"""
    global ios_config
    
    # Estimate iOS device dimensions based on mirror aspect ratio
    mirror_aspect_ratio = mirror_height / mirror_width
    
    # Common iOS device configurations
    ios_devices = [
        {"name": "iPhone 15 Pro", "width": 393, "height": 852},
        {"name": "iPhone 15 Plus", "width": 428, "height": 926},
        {"name": "iPhone 12/13/14", "width": 390, "height": 844},
        {"name": "iPhone 11 Pro Max", "width": 414, "height": 896},
        {"name": "iPhone X/XS", "width": 375, "height": 812},
        {"name": "iPad Pro 12.9", "width": 1024, "height": 1366},
        {"name": "iPad Pro 11", "width": 834, "height": 1194},
    ]
    
    # Find closest matching device based on aspect ratio
    best_match = min(ios_devices, key=lambda d: abs((d["height"] / d["width"]) - mirror_aspect_ratio))
    
    ios_config.update({
        "enabled": True,
        "mirror_x": mirror_x,
        "mirror_y": mirror_y,
        "mirror_width": mirror_width,
        "mirror_height": mirror_height,
        "ios_aspect_ratio": mirror_aspect_ratio,
        "estimated_ios_width": best_match["width"],
        "estimated_ios_height": best_match["height"]
    })
    
    print(f"iOS mapping configured: Estimated {best_match['name']} ({best_match['width']}x{best_match['height']}) -> {mirror_width}x{mirror_height} at ({mirror_x},{mirror_y})")
    print(f"Aspect ratio: {mirror_aspect_ratio:.3f}, Device: {best_match['name']}")

def transform_ios_coordinates(ios_x, ios_y):
    """Transform iOS coordinates to macOS screen coordinates"""
    if not ios_config["enabled"]:
        return ios_x, ios_y
    
    # Calculate scale factors based on estimated iOS dimensions
    scale_x = ios_config["mirror_width"] / ios_config["estimated_ios_width"]
    scale_y = ios_config["mirror_height"] / ios_config["estimated_ios_height"]
    
    # Convert iOS coordinates to macOS coordinates
    mac_x = ios_config["mirror_x"] + (ios_x * scale_x)
    mac_y = ios_config["mirror_y"] + (ios_y * scale_y)
    
    return int(mac_x), int(mac_y)

def get_ios_screenshot_region():
    """Get the region for iOS device screenshot"""
    if not ios_config["enabled"]:
        return None
    
    return (
        ios_config["mirror_x"],
        ios_config["mirror_y"],
        ios_config["mirror_width"],
        ios_config["mirror_height"]
    )

def handle_action(action):
    try:
        act = action.get("action")
        if act == "click":
            x = int(action["x"])
            y = int(action["y"])
            # Transform coordinates if iOS mapping is enabled
            mac_x, mac_y = transform_ios_coordinates(x, y)
            
            # Validate coordinates are within expected iOS mirror region
            if ios_config["enabled"]:
                mirror_left = ios_config["mirror_x"]
                mirror_top = ios_config["mirror_y"]
                mirror_right = mirror_left + ios_config["mirror_width"]
                mirror_bottom = mirror_top + ios_config["mirror_height"]
                
                if not (mirror_left <= mac_x <= mirror_right and mirror_top <= mac_y <= mirror_bottom):
                    print(f"WARNING: Click coordinates ({mac_x}, {mac_y}) are outside iOS mirror region ({mirror_left}, {mirror_top}, {mirror_right}, {mirror_bottom})")
                    print(f"Original iOS coordinates: ({x}, {y})")
                    print(f"This might cause the iOS app to lose focus!")
                
                print(f"Clicking at iOS coords ({x}, {y}) -> macOS coords ({mac_x}, {mac_y})")
            
            pyautogui.click(mac_x, mac_y)
            return {"status": "ok", "action": "click", "ios_coords": [x, y], "mac_coords": [mac_x, mac_y]}

        elif act == "move":
            x = int(action["x"])
            y = int(action["y"])
            duration = float(action.get("duration", 0.2))
            # Transform coordinates if iOS mapping is enabled
            mac_x, mac_y = transform_ios_coordinates(x, y)
            pyautogui.moveTo(mac_x, mac_y, duration=duration)
            return {"status": "ok", "action": "move", "ios_coords": [x, y], "mac_coords": [mac_x, mac_y]}

        elif act == "drag":
            x = int(action["x"])
            y = int(action["y"])
            x2 = int(action["x2"])
            y2 = int(action["y2"])
            duration = float(action.get("duration", 0.5))
            # Transform coordinates if iOS mapping is enabled
            mac_x, mac_y = transform_ios_coordinates(x, y)
            mac_x2, mac_y2 = transform_ios_coordinates(x2, y2)
            pyautogui.moveTo(mac_x, mac_y)
            pyautogui.dragTo(mac_x2, mac_y2, duration=duration)
            return {"status": "ok", "action": "drag", "ios_from": [x, y], "ios_to": [x2, y2], "mac_from": [mac_x, mac_y], "mac_to": [mac_x2, mac_y2]}

        elif act == "type":
            # select all
            pyautogui.hotkey('command', 'a')
            text = action["text"]
            interval = float(action.get("interval", 0.0))
            # For iOS, we need slower typing to ensure proper character registration
            # iOS virtual keyboards can miss characters if typing is too fast
            if interval == 0.0:
                # Set a default interval for iOS compatibility
                interval = 0.02  # 20ms between characters - good balance for iOS
            
            print(f"📱 iOS Type: '{text}' with interval {interval}s")
            
            # Use AppleScript to simulate keyboard input to avoid system shortcuts
            # This method sends text directly to the active application without triggering shortcuts
            try:
                # Escape special characters for AppleScript
                escaped_text = text.replace('"', '\\"').replace('\\', '\\\\')
                
                applescript = f'''
                tell application "System Events"
                    keystroke "{escaped_text}"
                end tell
                '''
                
                success, stdout, stderr = execute_applescript(applescript)
                if success:
                    print(f"   ✅ Used AppleScript keystroke for text input")
                    # Add interval delay if specified
                    if interval > 0:
                        time.sleep(len(text) * interval)
                    return {"status": "ok", "action": "type", "text": text, "method": "applescript", "interval": interval}
                else:
                    print(f"   ❌ AppleScript failed: {stderr}, falling back to character-by-character")
                    
            except Exception as e:
                print(f"   ❌ AppleScript method failed: {e}, falling back to character-by-character")
            
            # Fallback: Character-by-character input with modifier key clearing
            print(f"   🔤 Using character-by-character input method")
            
            # Clear any pressed modifier keys first
            modifier_keys = ['shift', 'ctrl', 'alt', 'cmd']
            for key in modifier_keys:
                try:
                    pyautogui.keyUp(key)
                except:
                    pass  # Ignore if key wasn't pressed
            
            # Type each character individually
            for i, char in enumerate(text):
                try:
                    # For special characters that might cause issues, use write method
                    if char in [' ', '\n', '\t']:
                        if char == ' ':
                            pyautogui.press('space')
                        elif char == '\n':
                            pyautogui.press('enter')
                        elif char == '\t':
                            pyautogui.press('tab')
                    else:
                        # Use write for individual characters to avoid shortcut combinations
                        pyautogui.write(char)
                    
                    # Add interval delay between characters
                    if interval > 0 and i < len(text) - 1:
                        time.sleep(interval)
                        
                except Exception as char_error:
                    print(f"   ⚠️ Error typing character '{char}': {char_error}")
                    continue
            
            return {"status": "ok", "action": "type", "text": text, "method": "character_by_character", "interval": interval}

        elif act == "key":
            key = action["key"]
            pyautogui.press(key)
            return {"status": "ok", "action": "key", "key": key}

        elif act == "hotkey":
            keys = action["keys"]
            if isinstance(keys, list):
                pyautogui.hotkey(*keys)
            else:
                pyautogui.hotkey(keys)
            return {"status": "ok", "action": "hotkey", "keys": keys}

        elif act == "scroll":
            x = int(action.get("x", ios_config["estimated_ios_width"] // 2 if ios_config["enabled"] else pyautogui.size().width // 2))
            y = int(action.get("y", ios_config["estimated_ios_height"] // 2 if ios_config["enabled"] else pyautogui.size().height // 2))
            
            # Enhanced distance calculation for better Android compatibility
            distance = int(action.get("distance", 100))
            direction = action.get("direction", "down")  # up, down, left, right
            
            # Transform coordinates if iOS mapping is enabled
            mac_x, mac_y = transform_ios_coordinates(x, y)
            
            # Calculate clicks based on distance
            if distance <= 50:
                clicks = max(8, int(distance * 0.4))
            elif distance <= 150:
                clicks = max(12, int(distance * 0.25))
            elif distance <= 300:
                clicks = max(18, int(distance * 0.18))
            else:
                clicks = max(25, int(distance * 0.12))
            
            print(f"📍 SCROLL: iOS({x}, {y}) -> Mac({mac_x}, {mac_y}), Direction: {direction}, Distance: {distance}px, Clicks: {clicks}")
            
            # Move mouse to the target position first
            pyautogui.moveTo(mac_x, mac_y)
            
            # Simplified scroll logic - direct implementation with multiple methods
            if direction in ["left", "right"]:
                print(f"🔄 HORIZONTAL SCROLL: {direction}")
                method = "horizontal_scroll"
                success = False
                
                if hasattr(pyautogui, 'hscroll'):
                    for i in range(clicks):
                        scroll_amount = 20 if direction == "left" else -20
                        pyautogui.hscroll(scroll_amount, x=mac_x, y=mac_y)
                else:
                    raise NotImplementedError("Horizontal scrolling not supported on this platform")
                    
            else:
                print(f"⬆️⬇️ VERTICAL SCROLL: {direction}")
                # Vertical scrolling (this should work fine)
                for i in range(clicks):
                    scroll_amount = 20 if direction == "up" else -20
                    pyautogui.scroll(scroll_amount, x=mac_x, y=mac_y)
                method = "vertical_scroll"
            
            print(f"✅ Scroll completed: {direction} ({clicks} iterations)")
            return {"status": "ok", "action": "scroll", "method": method, "ios_coords": [x, y], "mac_coords": [mac_x, mac_y], "direction": direction, "clicks": clicks, "distance": distance}

        elif act == "screenshot":
            # Take screenshot of iOS region if mapping is enabled
            region = get_ios_screenshot_region()
            if region:
                screenshot = pyautogui.screenshot(region=region)
            else:
                screenshot = pyautogui.screenshot()
            # Save to temporary file and return path
            temp_path = f"/tmp/screenshot_{int(time.time())}.png"
            screenshot.save(temp_path)
            return {"status": "ok", "action": "screenshot", "path": temp_path, "ios_region": region is not None}

        elif act == "get_screen_size":
            if ios_config["enabled"]:
                return {"status": "ok", "action": "get_screen_size", "width": ios_config["estimated_ios_width"], "height": ios_config["estimated_ios_height"], "mode": "ios"}
            else:
                size = pyautogui.size()
                return {"status": "ok", "action": "get_screen_size", "width": size.width, "height": size.height, "mode": "mac"}

        elif act == "configure_ios":
            mirror_x = int(action["mirror_x"])
            mirror_y = int(action["mirror_y"])
            mirror_width = int(action["mirror_width"])
            mirror_height = int(action["mirror_height"])
            setup_ios_mapping(mirror_x, mirror_y, mirror_width, mirror_height)
            return {"status": "ok", "action": "configure_ios", "config": ios_config}

        elif act == "sleep":
            seconds = float(action["seconds"])
            time.sleep(seconds)
            return {"status": "ok", "action": "sleep", "seconds": seconds}

        else:
            return {"status": "error", "error": f"Unknown action: {act}"}

    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    try:
        screen_size = pyautogui.size()
        return jsonify({
            "status": "ok",
            "message": "PyAutoGUI server is running",
            "screen_size": {"width": screen_size.width, "height": screen_size.height},
            "pyautogui_version": pyautogui.__version__ if hasattr(pyautogui, '__version__') else "unknown"
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500

@app.route("/configure", methods=["POST"])
def configure_ios():
    """Configure iOS device mapping"""
    try:
        data = request.get_json()
        # Support both snake_case and camelCase naming
        mirror_x = data.get("mirror_x") or data.get("mirrorX")
        mirror_y = data.get("mirror_y") or data.get("mirrorY")
        mirror_width = data.get("mirror_width") or data.get("mirrorWidth")
        mirror_height = data.get("mirror_height") or data.get("mirrorHeight")
        
        result = handle_action({
            "action": "configure_ios",
            "mirror_x": mirror_x,
            "mirror_y": mirror_y,
            "mirror_width": mirror_width,
            "mirror_height": mirror_height
        })
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        })

@app.route("/config", methods=["GET"])
def get_config():
    """Get current iOS configuration"""
    return jsonify({
        "status": "ok",
        "config": ios_config
    })

@app.route("/run", methods=["POST"])
def run_actions():
    try:
        data = request.get_json()
        if isinstance(data, list):
            results = [handle_action(act) for act in data]
            return jsonify({"status": "done", "results": results})
        elif isinstance(data, dict):
            result = handle_action(data)
            return jsonify(result)
        else:
            return jsonify({"status": "error", "error": "Invalid input format"})
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e),
            "traceback": traceback.format_exc()
        })

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 1412
    print(f"Starting PyAutoGUI server on port {port}")
    print(f"Screen size: {pyautogui.size()}")
    print("Health check available at: http://localhost:{}/health".format(port))
    app.run(host="0.0.0.0", port=port, debug=False)