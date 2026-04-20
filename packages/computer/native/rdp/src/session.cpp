#include "rdp_helper_session.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <random>
#include <sstream>
#include <stdexcept>

#include <freerdp/freerdp.h>
#include <freerdp/gdi/gdi.h>
#include <freerdp/input.h>
#include <freerdp/scancode.h>
#include <freerdp/settings.h>
#include <freerdp/settings_keys.h>
#include <winpr/synch.h>

namespace midscene::rdp {

namespace {

struct MidsceneRdpContext {
  rdpContext context;
  FreeRdpSessionTransport* owner = nullptr;
};

std::string ToLower(std::string_view value) {
  std::string lowered(value);
  std::transform(lowered.begin(), lowered.end(), lowered.begin(), [](unsigned char ch) {
    return static_cast<char>(std::tolower(ch));
  });
  return lowered;
}

std::string Trim(std::string_view value) {
  size_t start = 0;
  size_t end = value.size();
  while (start < end && std::isspace(static_cast<unsigned char>(value[start]))) {
    start++;
  }
  while (end > start &&
         std::isspace(static_cast<unsigned char>(value[end - 1]))) {
    end--;
  }
  return std::string(value.substr(start, end - start));
}

std::vector<std::string> SplitKeyCombo(std::string_view value) {
  std::vector<std::string> parts;
  size_t start = 0;
  while (start <= value.size()) {
    const size_t delimiter = value.find('+', start);
    const size_t end = delimiter == std::string_view::npos ? value.size() : delimiter;
    std::string part = Trim(value.substr(start, end - start));
    if (!part.empty()) {
      parts.push_back(std::move(part));
    }
    if (delimiter == std::string_view::npos) {
      break;
    }
    start = delimiter + 1;
  }
  return parts;
}

std::string GenerateSessionId() {
  std::random_device device;
  std::mt19937_64 generator(device());
  std::uniform_int_distribution<uint64_t> distribution;

  std::ostringstream session_id;
  session_id << std::hex << distribution(generator) << distribution(generator);
  return session_id.str();
}

DWORD VerifyCertificateEx(freerdp* instance,
                          const char* host,
                          UINT16 port,
                          const char* common_name,
                          const char* subject,
                          const char* issuer,
                          const char* fingerprint,
                          DWORD flags) {
  static_cast<void>(instance);
  static_cast<void>(host);
  static_cast<void>(port);
  static_cast<void>(common_name);
  static_cast<void>(subject);
  static_cast<void>(issuer);
  static_cast<void>(fingerprint);
  static_cast<void>(flags);
  return 2;
}

DWORD VerifyChangedCertificateEx(freerdp* instance,
                                 const char* host,
                                 UINT16 port,
                                 const char* common_name,
                                 const char* subject,
                                 const char* issuer,
                                 const char* new_fingerprint,
                                 const char* old_subject,
                                 const char* old_issuer,
                                 const char* old_fingerprint,
                                 DWORD flags) {
  static_cast<void>(instance);
  static_cast<void>(host);
  static_cast<void>(port);
  static_cast<void>(common_name);
  static_cast<void>(subject);
  static_cast<void>(issuer);
  static_cast<void>(new_fingerprint);
  static_cast<void>(old_subject);
  static_cast<void>(old_issuer);
  static_cast<void>(old_fingerprint);
  static_cast<void>(flags);
  return 2;
}

BOOL ContextNew(freerdp* instance, rdpContext* context) {
  static_cast<void>(instance);
  auto* typed_context = reinterpret_cast<MidsceneRdpContext*>(context);
  typed_context->owner = nullptr;
  return TRUE;
}

void ContextFree(freerdp* instance, rdpContext* context) {
  static_cast<void>(instance);
  static_cast<void>(context);
}

BOOL PreConnect(freerdp* instance) {
  static_cast<void>(instance);
  return TRUE;
}

BOOL PostConnect(freerdp* instance) {
  if (!gdi_init(instance, PIXEL_FORMAT_BGRA32)) {
    return FALSE;
  }

  auto* typed_context =
      reinterpret_cast<MidsceneRdpContext*>(instance->context);
  if (typed_context->owner) {
    typed_context->owner->MarkGdiInitialized();
  }

  rdpInput* input = instance->context ? instance->context->input : nullptr;
  if (input) {
    freerdp_input_send_synchronize_event(input, 0);
    freerdp_input_send_focus_in_event(input, 0);
  }

  return TRUE;
}

std::optional<uint32_t> LookupScancode(std::string_view key_name) {
  const std::string lowered = ToLower(key_name);
  if (lowered.size() == 1) {
    switch (lowered[0]) {
      case 'a':
        return RDP_SCANCODE_KEY_A;
      case 'b':
        return RDP_SCANCODE_KEY_B;
      case 'c':
        return RDP_SCANCODE_KEY_C;
      case 'd':
        return RDP_SCANCODE_KEY_D;
      case 'e':
        return RDP_SCANCODE_KEY_E;
      case 'f':
        return RDP_SCANCODE_KEY_F;
      case 'g':
        return RDP_SCANCODE_KEY_G;
      case 'h':
        return RDP_SCANCODE_KEY_H;
      case 'i':
        return RDP_SCANCODE_KEY_I;
      case 'j':
        return RDP_SCANCODE_KEY_J;
      case 'k':
        return RDP_SCANCODE_KEY_K;
      case 'l':
        return RDP_SCANCODE_KEY_L;
      case 'm':
        return RDP_SCANCODE_KEY_M;
      case 'n':
        return RDP_SCANCODE_KEY_N;
      case 'o':
        return RDP_SCANCODE_KEY_O;
      case 'p':
        return RDP_SCANCODE_KEY_P;
      case 'q':
        return RDP_SCANCODE_KEY_Q;
      case 'r':
        return RDP_SCANCODE_KEY_R;
      case 's':
        return RDP_SCANCODE_KEY_S;
      case 't':
        return RDP_SCANCODE_KEY_T;
      case 'u':
        return RDP_SCANCODE_KEY_U;
      case 'v':
        return RDP_SCANCODE_KEY_V;
      case 'w':
        return RDP_SCANCODE_KEY_W;
      case 'x':
        return RDP_SCANCODE_KEY_X;
      case 'y':
        return RDP_SCANCODE_KEY_Y;
      case 'z':
        return RDP_SCANCODE_KEY_Z;
      case '0':
        return RDP_SCANCODE_KEY_0;
      case '1':
        return RDP_SCANCODE_KEY_1;
      case '2':
        return RDP_SCANCODE_KEY_2;
      case '3':
        return RDP_SCANCODE_KEY_3;
      case '4':
        return RDP_SCANCODE_KEY_4;
      case '5':
        return RDP_SCANCODE_KEY_5;
      case '6':
        return RDP_SCANCODE_KEY_6;
      case '7':
        return RDP_SCANCODE_KEY_7;
      case '8':
        return RDP_SCANCODE_KEY_8;
      case '9':
        return RDP_SCANCODE_KEY_9;
      default:
        break;
    }
  }

  if (lowered == "enter" || lowered == "return") {
    return RDP_SCANCODE_RETURN;
  }
  if (lowered == "backspace") {
    return RDP_SCANCODE_BACKSPACE;
  }
  if (lowered == "delete") {
    return RDP_SCANCODE_DELETE;
  }
  if (lowered == "tab") {
    return RDP_SCANCODE_TAB;
  }
  if (lowered == "escape" || lowered == "esc") {
    return RDP_SCANCODE_ESCAPE;
  }
  if (lowered == "space") {
    return RDP_SCANCODE_SPACE;
  }
  if (lowered == "left") {
    return RDP_SCANCODE_LEFT;
  }
  if (lowered == "right") {
    return RDP_SCANCODE_RIGHT;
  }
  if (lowered == "up") {
    return RDP_SCANCODE_UP;
  }
  if (lowered == "down") {
    return RDP_SCANCODE_DOWN;
  }
  if (lowered == "home") {
    return RDP_SCANCODE_HOME;
  }
  if (lowered == "end") {
    return RDP_SCANCODE_END;
  }
  if (lowered == "pageup") {
    return RDP_SCANCODE_PRIOR;
  }
  if (lowered == "pagedown") {
    return RDP_SCANCODE_NEXT;
  }
  if (lowered == "control" || lowered == "ctrl") {
    return RDP_SCANCODE_LCONTROL;
  }
  if (lowered == "shift") {
    return RDP_SCANCODE_LSHIFT;
  }
  if (lowered == "alt" || lowered == "option") {
    return RDP_SCANCODE_LMENU;
  }
  if (lowered == "meta" || lowered == "win" || lowered == "windows" ||
      lowered == "command") {
    return RDP_SCANCODE_LWIN;
  }

  return std::nullopt;
}

std::optional<char32_t> NextUtf8Codepoint(std::string_view text, size_t* offset) {
  if (*offset >= text.size()) {
    return std::nullopt;
  }

  const unsigned char first = static_cast<unsigned char>(text[*offset]);
  if (first < 0x80) {
    (*offset)++;
    return first;
  }

  auto continuation = [&](size_t index) -> uint8_t {
    if (index >= text.size()) {
      throw std::runtime_error("Invalid UTF-8 text input");
    }
    const unsigned char byte = static_cast<unsigned char>(text[index]);
    if ((byte & 0xC0) != 0x80) {
      throw std::runtime_error("Invalid UTF-8 text input");
    }
    return static_cast<uint8_t>(byte & 0x3F);
  };

  if ((first & 0xE0) == 0xC0) {
    const char32_t codepoint =
        ((first & 0x1F) << 6) | continuation(*offset + 1);
    *offset += 2;
    return codepoint;
  }
  if ((first & 0xF0) == 0xE0) {
    const char32_t codepoint =
        ((first & 0x0F) << 12) | (continuation(*offset + 1) << 6) |
        continuation(*offset + 2);
    *offset += 3;
    return codepoint;
  }
  if ((first & 0xF8) == 0xF0) {
    const char32_t codepoint =
        ((first & 0x07) << 18) | (continuation(*offset + 1) << 12) |
        (continuation(*offset + 2) << 6) | continuation(*offset + 3);
    *offset += 4;
    return codepoint;
  }

  throw std::runtime_error("Invalid UTF-8 text input");
}

}  // namespace

FreeRdpSessionTransport::FreeRdpSessionTransport() = default;

FreeRdpSessionTransport::~FreeRdpSessionTransport() {
  try {
    Disconnect();
  } catch (...) {
  }
}

ConnectionInfo FreeRdpSessionTransport::Connect(const ConnectionConfig& config) {
  if (config.host.empty()) {
    throw std::runtime_error("connect.config.host is required");
  }

  Disconnect();

  freerdp* instance = freerdp_new();
  if (!instance) {
    throw std::runtime_error("Failed to allocate FreeRDP instance");
  }

  instance->ContextSize = sizeof(MidsceneRdpContext);
  instance->ContextNew = ContextNew;
  instance->ContextFree = ContextFree;
  instance->PreConnect = PreConnect;
  instance->PostConnect = PostConnect;

  if (config.ignore_certificate) {
    instance->VerifyCertificateEx = VerifyCertificateEx;
    instance->VerifyChangedCertificateEx = VerifyChangedCertificateEx;
  }

  if (!freerdp_context_new(instance)) {
    freerdp_free(instance);
    throw std::runtime_error("Failed to initialize FreeRDP context");
  }

  auto* typed_context = reinterpret_cast<MidsceneRdpContext*>(instance->context);
  typed_context->owner = this;

  rdpSettings* settings = instance->context->settings;
  bool configured = true;
  configured =
      configured && freerdp_settings_set_string(settings, FreeRDP_ServerHostname, config.host.c_str());
  configured = configured &&
               freerdp_settings_set_uint32(settings, FreeRDP_ServerPort, config.port);
  configured = configured &&
               freerdp_settings_set_uint32(settings, FreeRDP_DesktopWidth, config.desktop_width);
  configured = configured &&
               freerdp_settings_set_uint32(settings, FreeRDP_DesktopHeight, config.desktop_height);
  configured =
      configured && freerdp_settings_set_uint32(settings, FreeRDP_ColorDepth, 32);
  configured =
      configured && freerdp_settings_set_bool(settings, FreeRDP_SoftwareGdi, TRUE);
  configured = configured &&
               freerdp_settings_set_bool(settings, FreeRDP_SupportGraphicsPipeline, FALSE);
  configured = configured &&
               freerdp_settings_set_bool(settings, FreeRDP_IgnoreCertificate, config.ignore_certificate);
  configured = configured &&
               freerdp_settings_set_bool(settings, FreeRDP_ConsoleSession, config.admin_session);

  if (!config.username.empty()) {
    configured =
        configured && freerdp_settings_set_string(settings, FreeRDP_Username, config.username.c_str());
  }
  if (!config.password.empty()) {
    configured =
        configured && freerdp_settings_set_string(settings, FreeRDP_Password, config.password.c_str());
  }
  if (!config.domain.empty()) {
    configured =
        configured && freerdp_settings_set_string(settings, FreeRDP_Domain, config.domain.c_str());
  }

  if (config.security_protocol == "tls" || config.security_protocol == "nla" ||
      config.security_protocol == "rdp") {
    configured = configured &&
                 freerdp_settings_set_bool(settings, FreeRDP_TlsSecurity,
                                           config.security_protocol == "tls");
    configured = configured &&
                 freerdp_settings_set_bool(settings, FreeRDP_NlaSecurity,
                                           config.security_protocol == "nla");
    configured = configured &&
                 freerdp_settings_set_bool(settings, FreeRDP_RdpSecurity,
                                           config.security_protocol == "rdp");
  }

  if (!configured) {
    freerdp_context_free(instance);
    freerdp_free(instance);
    throw std::runtime_error("Failed to configure FreeRDP session settings");
  }

  {
    std::lock_guard<std::mutex> lock(mutex_);
    instance_ = instance;
    mouse_x_ = 0;
    mouse_y_ = 0;
    ClearSessionErrorLocked();
  }

  bool connected = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    connected = freerdp_connect(instance_) == TRUE;
  }

  if (!connected) {
    const std::string error = LastFreeRdpErrorLocked();
    StopInstance(false);
    throw std::runtime_error("Failed to connect to RDP server: " + error);
  }

  ConnectionInfo info;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    session_id_ = GenerateSessionId();
    connected_ = true;
    running_ = true;
    info.session_id = session_id_;
    const char* host = freerdp_settings_get_server_name(settings);
    const UINT32 port =
        freerdp_settings_get_uint32(settings, FreeRDP_ServerPort);
    std::ostringstream server;
    server << (host ? host : "") << ":" << port;
    info.server = server.str();
    if (instance_->context && instance_->context->gdi) {
      info.size.width = instance_->context->gdi->width;
      info.size.height = instance_->context->gdi->height;
    }
  }

  event_thread_ = std::thread(&FreeRdpSessionTransport::EventLoop, this);
  return info;
}

void FreeRdpSessionTransport::Disconnect() {
  StopInstance(false);
}

RawFrame FreeRdpSessionTransport::CaptureFrame() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!connected_ || !instance_ || !instance_->context || !instance_->context->gdi) {
    throw std::runtime_error("No remote framebuffer is available");
  }

  rdpGdi* gdi = instance_->context->gdi;
  if (!gdi->primary_buffer || gdi->width <= 0 || gdi->height <= 0 || gdi->stride == 0) {
    throw std::runtime_error("Remote framebuffer is empty");
  }

  RawFrame frame;
  frame.size.width = gdi->width;
  frame.size.height = gdi->height;
  frame.stride = static_cast<size_t>(gdi->stride);
  const size_t buffer_size = frame.stride * static_cast<size_t>(gdi->height);
  frame.bgra.assign(gdi->primary_buffer, gdi->primary_buffer + buffer_size);
  return frame;
}

Size FreeRdpSessionTransport::GetSize() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!connected_ || !instance_ || !instance_->context || !instance_->context->gdi) {
    return {};
  }

  return Size{
      instance_->context->gdi->width,
      instance_->context->gdi->height,
  };
}

void FreeRdpSessionTransport::MouseMove(uint16_t x, uint16_t y) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!instance_ || !instance_->context || !instance_->context->input ||
      !freerdp_input_send_mouse_event(instance_->context->input, PTR_FLAGS_MOVE, x, y)) {
    throw std::runtime_error(LastFreeRdpErrorLocked());
  }

  mouse_x_ = x;
  mouse_y_ = y;
}

void FreeRdpSessionTransport::MouseButton(std::string_view button,
                                          std::string_view action) {
  const std::string normalized_button = ToLower(button);
  const std::string normalized_action = ToLower(action);

  uint16_t button_flags = 0;
  if (normalized_button == "left") {
    button_flags = PTR_FLAGS_BUTTON1;
  } else if (normalized_button == "right") {
    button_flags = PTR_FLAGS_BUTTON2;
  } else if (normalized_button == "middle") {
    button_flags = PTR_FLAGS_BUTTON3;
  } else {
    throw std::runtime_error("Unsupported mouse button action");
  }

  auto send_button = [&](bool down) {
    const uint16_t flags = down ? static_cast<uint16_t>(button_flags | PTR_FLAGS_DOWN)
                                : button_flags;
    if (!freerdp_input_send_mouse_event(instance_->context->input, flags, mouse_x_,
                                        mouse_y_)) {
      throw std::runtime_error(LastFreeRdpErrorLocked());
    }
  };

  std::lock_guard<std::mutex> lock(mutex_);
  if (!instance_ || !instance_->context || !instance_->context->input) {
    throw std::runtime_error("Unsupported mouse button action");
  }

  if (normalized_action == "down") {
    send_button(true);
    return;
  }
  if (normalized_action == "up") {
    send_button(false);
    return;
  }
  if (normalized_action == "click") {
    send_button(true);
    send_button(false);
    return;
  }
  if (normalized_action == "doubleclick") {
    send_button(true);
    send_button(false);
    send_button(true);
    send_button(false);
    return;
  }

  throw std::runtime_error("Unsupported mouse button action");
}

void FreeRdpSessionTransport::Wheel(std::string_view direction,
                                    int32_t amount,
                                    std::optional<uint16_t> x,
                                    std::optional<uint16_t> y) {
  const std::string normalized_direction = ToLower(direction);
  std::lock_guard<std::mutex> lock(mutex_);
  if (!instance_ || !instance_->context || !instance_->context->input) {
    throw std::runtime_error("Failed to send wheel input");
  }

  if (x.has_value() && y.has_value()) {
    if (!freerdp_input_send_mouse_event(instance_->context->input, PTR_FLAGS_MOVE, *x, *y)) {
      throw std::runtime_error("Failed to send wheel input");
    }
    mouse_x_ = *x;
    mouse_y_ = *y;
  }

  uint16_t base_flags = 0;
  bool negative = false;
  if (normalized_direction == "up") {
    base_flags = PTR_FLAGS_WHEEL;
  } else if (normalized_direction == "down") {
    base_flags = PTR_FLAGS_WHEEL;
    negative = true;
  } else if (normalized_direction == "left") {
    base_flags = PTR_FLAGS_HWHEEL;
  } else if (normalized_direction == "right") {
    base_flags = PTR_FLAGS_HWHEEL;
    negative = true;
  } else {
    throw std::runtime_error("Failed to send wheel input");
  }

  int32_t remaining = std::abs(amount);
  if (remaining == 0) {
    remaining = 120;
  }

  while (remaining > 0) {
    const uint16_t chunk = static_cast<uint16_t>(std::min<int32_t>(remaining, 120));
    uint16_t flags = static_cast<uint16_t>(base_flags | (chunk & WheelRotationMask));
    if (negative) {
      flags = static_cast<uint16_t>(flags | PTR_FLAGS_WHEEL_NEGATIVE);
    }
    if (!freerdp_input_send_mouse_event(instance_->context->input, flags, mouse_x_, mouse_y_)) {
      throw std::runtime_error("Failed to send wheel input");
    }
    remaining -= chunk;
  }
}

void FreeRdpSessionTransport::KeyPress(std::string_view key_name) {
  const std::vector<std::string> parts = SplitKeyCombo(key_name);
  if (parts.empty()) {
    throw std::runtime_error("Unsupported keyPress value: " + std::string(key_name));
  }

  std::vector<uint32_t> modifiers;
  for (size_t index = 0; index + 1 < parts.size(); index++) {
    const auto scancode = LookupScancode(parts[index]);
    if (!scancode.has_value()) {
      throw std::runtime_error("Unsupported keyPress value: " + std::string(key_name));
    }
    modifiers.push_back(*scancode);
  }

  const auto final_scancode = LookupScancode(parts.back());
  if (!final_scancode.has_value()) {
    throw std::runtime_error("Unsupported keyPress value: " + std::string(key_name));
  }

  std::lock_guard<std::mutex> lock(mutex_);
  if (!instance_ || !instance_->context || !instance_->context->input) {
    throw std::runtime_error("Unsupported keyPress value: " + std::string(key_name));
  }

  auto key_down = [&](uint32_t scancode) {
    if (!freerdp_input_send_keyboard_event_ex(instance_->context->input, TRUE, FALSE, scancode)) {
      throw std::runtime_error("Unsupported keyPress value: " + std::string(key_name));
    }
  };
  auto key_up = [&](uint32_t scancode) {
    if (!freerdp_input_send_keyboard_event_ex(instance_->context->input, FALSE, FALSE, scancode)) {
      throw std::runtime_error("Unsupported keyPress value: " + std::string(key_name));
    }
  };

  for (uint32_t modifier : modifiers) {
    key_down(modifier);
  }

  key_down(*final_scancode);
  key_up(*final_scancode);

  for (auto iterator = modifiers.rbegin(); iterator != modifiers.rend(); ++iterator) {
    key_up(*iterator);
  }
}

void FreeRdpSessionTransport::TypeText(std::string_view text) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!instance_ || !instance_->context || !instance_->context->input) {
    throw std::runtime_error("Failed to send unicode keyboard input");
  }

  size_t offset = 0;
  while (offset < text.size()) {
    const std::optional<char32_t> codepoint = NextUtf8Codepoint(text, &offset);
    if (!codepoint.has_value()) {
      break;
    }

    if (*codepoint == '\r' || *codepoint == '\n') {
      if (!freerdp_input_send_keyboard_event_ex(instance_->context->input, TRUE, FALSE,
                                                RDP_SCANCODE_RETURN) ||
          !freerdp_input_send_keyboard_event_ex(instance_->context->input, FALSE, FALSE,
                                                RDP_SCANCODE_RETURN)) {
        throw std::runtime_error("Failed to send unicode keyboard input");
      }
      continue;
    }

    if (*codepoint > 0xFFFF) {
      throw std::runtime_error("Failed to send unicode keyboard input");
    }

    if (!freerdp_input_send_unicode_keyboard_event(instance_->context->input, 0,
                                                   static_cast<UINT16>(*codepoint)) ||
        !freerdp_input_send_unicode_keyboard_event(instance_->context->input,
                                                   KBD_FLAGS_RELEASE,
                                                   static_cast<UINT16>(*codepoint))) {
      throw std::runtime_error("Failed to send unicode keyboard input");
    }
  }
}

void FreeRdpSessionTransport::ClearInput() {
  KeyPress("Control+A");
  std::lock_guard<std::mutex> lock(mutex_);
  if (!instance_ || !instance_->context || !instance_->context->input ||
      !freerdp_input_send_keyboard_event_ex(instance_->context->input, TRUE, FALSE,
                                            RDP_SCANCODE_BACKSPACE) ||
      !freerdp_input_send_keyboard_event_ex(instance_->context->input, FALSE, FALSE,
                                            RDP_SCANCODE_BACKSPACE)) {
    throw std::runtime_error("Failed to clear the active input field");
  }
}

bool FreeRdpSessionTransport::IsConnected() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return connected_;
}

std::optional<ErrorPayload> FreeRdpSessionTransport::LastError() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return last_error_;
}

void FreeRdpSessionTransport::ResetStateLocked() {
  instance_ = nullptr;
  running_ = false;
  connected_ = false;
  gdi_initialized_ = false;
  mouse_x_ = 0;
  mouse_y_ = 0;
  session_id_.clear();
}

void FreeRdpSessionTransport::MarkGdiInitialized() {
  gdi_initialized_ = true;
}

void FreeRdpSessionTransport::ClearSessionErrorLocked() {
  last_error_.reset();
}

void FreeRdpSessionTransport::SetSessionError(std::string message, std::string code) {
  std::lock_guard<std::mutex> lock(mutex_);
  last_error_ = ErrorPayload{
      std::move(code),
      message.empty() ? "RDP session was lost" : std::move(message),
  };
}

std::string FreeRdpSessionTransport::LastFreeRdpErrorLocked() const {
  if (!instance_ || !instance_->context) {
    return "FreeRDP session is not initialized";
  }

  const UINT32 last_error = freerdp_get_last_error(instance_->context);
  const char* error_name = freerdp_get_last_error_name(last_error);
  const char* error_message = freerdp_get_last_error_string(last_error);

  std::ostringstream stream;
  if (error_name && error_message) {
    stream << error_name << ": " << error_message;
    return stream.str();
  }
  if (error_name) {
    stream << error_name;
    return stream.str();
  }
  if (error_message) {
    stream << error_message;
    return stream.str();
  }

  stream << "FreeRDP error code " << last_error;
  return stream.str();
}

void FreeRdpSessionTransport::StopInstance(bool preserve_session_error) {
  freerdp* instance = nullptr;
  bool should_disconnect = false;
  bool should_free_gdi = false;

  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!instance_) {
      if (!preserve_session_error) {
        ClearSessionErrorLocked();
      }
      ResetStateLocked();
      return;
    }

    instance = instance_;
    should_disconnect = connected_;
    should_free_gdi = gdi_initialized_;
    running_ = false;
    connected_ = false;
    gdi_initialized_ = false;
    if (!preserve_session_error) {
      ClearSessionErrorLocked();
    }
  }

  if (should_disconnect) {
    std::lock_guard<std::mutex> lock(mutex_);
    freerdp_disconnect(instance_);
  }

  if (event_thread_.joinable() &&
      event_thread_.get_id() != std::this_thread::get_id()) {
    event_thread_.join();
  }

  if (should_free_gdi) {
    gdi_free(instance);
  }

  freerdp_context_free(instance);
  freerdp_free(instance);

  std::lock_guard<std::mutex> lock(mutex_);
  ResetStateLocked();
}

void FreeRdpSessionTransport::EventLoop() {
  while (true) {
    freerdp* instance = nullptr;
    bool running = false;
    bool connected = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      instance = instance_;
      running = running_;
      connected = connected_;
    }

    if (!running || !connected || !instance || !instance->context) {
      return;
    }

    HANDLE handles[32] = {};
    const DWORD count = freerdp_get_event_handles(
        instance->context, handles, static_cast<DWORD>(std::size(handles)));
    if (count == 0) {
      SetSessionError("freerdp_get_event_handles returned no handles", "session_lost");
      {
        std::lock_guard<std::mutex> lock(mutex_);
        connected_ = false;
        running_ = false;
      }
      std::fprintf(stderr,
                   "RDP session event loop failed: freerdp_get_event_handles returned no handles\n");
      std::fflush(stderr);
      return;
    }

    const DWORD status = WaitForMultipleObjects(count, handles, FALSE, 100);
    if (status == WAIT_FAILED) {
      SetSessionError("WaitForMultipleObjects failed in the RDP event loop",
                      "session_lost");
      {
        std::lock_guard<std::mutex> lock(mutex_);
        connected_ = false;
        running_ = false;
      }
      std::fprintf(stderr,
                   "RDP session event loop failed: WaitForMultipleObjects failed\n");
      std::fflush(stderr);
      return;
    }

    bool ok = true;
    bool should_disconnect = false;
    std::string failure_reason;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (!instance_ || !instance_->context) {
        return;
      }
      ok = freerdp_check_event_handles(instance_->context) == TRUE;
      should_disconnect =
          freerdp_shall_disconnect_context(instance_->context) == TRUE;
      if (!ok || should_disconnect) {
        failure_reason = LastFreeRdpErrorLocked();
      }
    }

    if (!ok || should_disconnect) {
      SetSessionError(failure_reason, "session_lost");
      {
        std::lock_guard<std::mutex> lock(mutex_);
        connected_ = false;
        running_ = false;
      }
      std::fprintf(stderr, "RDP session event loop failed: %s\n",
                   failure_reason.c_str());
      std::fflush(stderr);
      return;
    }
  }
}

}  // namespace midscene::rdp
