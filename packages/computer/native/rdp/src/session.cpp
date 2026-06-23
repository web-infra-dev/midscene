#include "rdp_helper_session.hpp"

#include <algorithm>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <memory>
#include <random>
#include <sstream>
#include <stdexcept>
#include <unordered_set>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <fcntl.h>
#include <netdb.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

#include <freerdp/error.h>
#include <freerdp/freerdp.h>
#include <freerdp/gdi/gdi.h>
#include <freerdp/input.h>
#include <freerdp/scancode.h>
#include <freerdp/settings.h>
#include <freerdp/settings_keys.h>
#include <freerdp/transport_io.h>
#include <winpr/synch.h>

namespace midscene::rdp {

namespace {

struct MidsceneRdpContext {
  rdpContext context;
  FreeRdpSessionTransport* owner = nullptr;
};

struct LocalAddressTcpConnectContext {
  std::string local_address;
  rdpTransportIo default_io;
};

#ifdef _WIN32
using SocketHandle = SOCKET;
constexpr SocketHandle kInvalidSocketHandle = INVALID_SOCKET;
using FdSetSocket = SOCKET;
#else
using SocketHandle = int;
constexpr SocketHandle kInvalidSocketHandle = -1;
using FdSetSocket = int;
#endif

// Maximum time Connect() waits for the first desktop frame before giving up.
// Normal sessions paint within a few hundred milliseconds; a session that
// never paints within this window is treated as blank/locked and fails fast
// instead of feeding an all-black screenshot to the caller.
constexpr int kFirstFrameTimeoutMs = 20'000;
// The first frame should prove that real desktop pixels reached the primary
// buffer without requiring a complex wallpaper or fully loaded app content.
constexpr size_t kMinInformativeColorCount = 128;
constexpr size_t kMinInformativeNonBlackPermille = 150;

bool IsInvalidSocketHandle(SocketHandle socket_handle) {
#ifdef _WIN32
  return socket_handle == INVALID_SOCKET;
#else
  return socket_handle < 0;
#endif
}

bool SocketHandleFitsFreeRdpInt(SocketHandle socket_handle) {
#ifdef _WIN32
  return socket_handle <=
         static_cast<SocketHandle>(std::numeric_limits<int>::max());
#else
  static_cast<void>(socket_handle);
  return true;
#endif
}

int SocketHandleToFreeRdpInt(SocketHandle socket_handle) {
  return static_cast<int>(socket_handle);
}

void CloseSocketHandle(SocketHandle socket_handle) {
  if (!IsInvalidSocketHandle(socket_handle)) {
#ifdef _WIN32
    closesocket(socket_handle);
#else
    close(socket_handle);
#endif
  }
}

int LastSocketError() {
#ifdef _WIN32
  return WSAGetLastError();
#else
  return errno;
#endif
}

std::string SocketErrorMessage(int error_code) {
#ifdef _WIN32
  char message[256] = {};
  const DWORD length = FormatMessageA(
      FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, nullptr,
      static_cast<DWORD>(error_code), MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
      message, sizeof(message), nullptr);
  if (length > 0) {
    return std::string(message, length);
  }
  return "socket error " + std::to_string(error_code);
#else
  return std::strerror(error_code);
#endif
}

int BindSocketHandle(SocketHandle socket_handle,
                     const sockaddr* address,
                     socklen_t address_length) {
#ifdef _WIN32
  return bind(socket_handle, address, static_cast<int>(address_length));
#else
  return bind(socket_handle, address, address_length);
#endif
}

int ConnectSocketHandle(SocketHandle socket_handle,
                        const sockaddr* address,
                        socklen_t address_length) {
#ifdef _WIN32
  return connect(socket_handle, address, static_cast<int>(address_length));
#else
  return connect(socket_handle, address, address_length);
#endif
}

bool SetSocketNonBlocking(SocketHandle socket_handle,
                          int& original_flags,
                          std::string& last_error) {
#ifdef _WIN32
  static_cast<void>(original_flags);
  u_long mode = 1;
  if (ioctlsocket(socket_handle, FIONBIO, &mode) != 0) {
    last_error = "failed to set socket non-blocking mode: " +
                 SocketErrorMessage(LastSocketError());
    return false;
  }
  return true;
#else
  original_flags = fcntl(socket_handle, F_GETFL, 0);
  if (original_flags < 0) {
    last_error = "failed to read socket flags: " + SocketErrorMessage(errno);
    return false;
  }

  if (fcntl(socket_handle, F_SETFL, original_flags | O_NONBLOCK) < 0) {
    last_error = "failed to set socket non-blocking mode: " +
                 SocketErrorMessage(errno);
    return false;
  }
  return true;
#endif
}

void RestoreSocketBlockingMode(SocketHandle socket_handle, int original_flags) {
#ifdef _WIN32
  static_cast<void>(original_flags);
  u_long mode = 0;
  (void)ioctlsocket(socket_handle, FIONBIO, &mode);
#else
  (void)fcntl(socket_handle, F_SETFL, original_flags);
#endif
}

bool IsConnectInProgressError(int error_code) {
#ifdef _WIN32
  return error_code == WSAEINPROGRESS || error_code == WSAEWOULDBLOCK;
#else
  return error_code == EINPROGRESS;
#endif
}

int SelectWritableSocket(SocketHandle socket_handle,
                         fd_set* write_fds,
                         timeval* timeout) {
#ifdef _WIN32
  static_cast<void>(socket_handle);
  return select(0, nullptr, write_fds, nullptr, timeout);
#else
  return select(socket_handle + 1, nullptr, write_fds, nullptr, timeout);
#endif
}

int GetSocketConnectError(SocketHandle socket_handle, std::string& last_error) {
  int socket_error = 0;
#ifdef _WIN32
  int socket_error_length = sizeof(socket_error);
  if (getsockopt(socket_handle, SOL_SOCKET, SO_ERROR,
                 reinterpret_cast<char*>(&socket_error),
                 &socket_error_length) != 0) {
    last_error = "getsockopt(SO_ERROR) failed: " +
                 SocketErrorMessage(LastSocketError());
    return -1;
  }
#else
  socklen_t socket_error_length = sizeof(socket_error);
  if (getsockopt(socket_handle, SOL_SOCKET, SO_ERROR, &socket_error,
                 &socket_error_length) != 0) {
    last_error = "getsockopt(SO_ERROR) failed: " + SocketErrorMessage(errno);
    return -1;
  }
#endif
  return socket_error;
}

bool BindSocketToLocalAddress(SocketHandle socket_handle,
                              int address_family,
                              const std::string& local_address,
                              std::string& last_error) {
  addrinfo hints = {};
  hints.ai_family = address_family;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_flags = AI_NUMERICHOST;

  addrinfo* local_result = nullptr;
  const int status =
      getaddrinfo(local_address.c_str(), "0", &hints, &local_result);
  if (status != 0) {
    last_error = "failed to resolve localAddress " + local_address + ": " +
                 gai_strerror(status);
    return false;
  }

  std::unique_ptr<addrinfo, decltype(&freeaddrinfo)> local_addresses(
      local_result, freeaddrinfo);
  for (addrinfo* local = local_addresses.get(); local; local = local->ai_next) {
    if (BindSocketHandle(socket_handle, local->ai_addr, local->ai_addrlen) ==
        0) {
      return true;
    }
    last_error = "failed to bind localAddress " + local_address + ": " +
                 SocketErrorMessage(LastSocketError());
  }

  return false;
}

bool ConnectSocketWithTimeout(SocketHandle socket_handle,
                              const sockaddr* address,
                              socklen_t address_length,
                              DWORD timeout_ms,
                              std::string& last_error) {
  int original_flags = 0;
  if (!SetSocketNonBlocking(socket_handle, original_flags, last_error)) {
    return false;
  }

  if (ConnectSocketHandle(socket_handle, address, address_length) == 0) {
    RestoreSocketBlockingMode(socket_handle, original_flags);
    return true;
  }

  const int connect_error = LastSocketError();
  if (!IsConnectInProgressError(connect_error)) {
    last_error = "connect failed: " + SocketErrorMessage(connect_error);
    RestoreSocketBlockingMode(socket_handle, original_flags);
    return false;
  }

  fd_set write_fds;
  FD_ZERO(&write_fds);
  FD_SET(static_cast<FdSetSocket>(socket_handle), &write_fds);

  timeval timeout = {};
  timeval* timeout_ptr = nullptr;
  if (timeout_ms > 0) {
    timeout.tv_sec = static_cast<long>(timeout_ms / 1000);
    timeout.tv_usec = static_cast<long>((timeout_ms % 1000) * 1000);
    timeout_ptr = &timeout;
  }

  const int select_result =
      SelectWritableSocket(socket_handle, &write_fds, timeout_ptr);
  if (select_result <= 0) {
    last_error =
        select_result == 0 ? "connect timeout" : "select failed: " +
                                                   SocketErrorMessage(LastSocketError());
    RestoreSocketBlockingMode(socket_handle, original_flags);
    return false;
  }

  const int socket_error = GetSocketConnectError(socket_handle, last_error);
  if (socket_error < 0) {
    RestoreSocketBlockingMode(socket_handle, original_flags);
    return false;
  }

  if (socket_error != 0) {
    last_error = "connect failed: " + SocketErrorMessage(socket_error);
    RestoreSocketBlockingMode(socket_handle, original_flags);
    return false;
  }

  RestoreSocketBlockingMode(socket_handle, original_flags);
  return true;
}

SocketHandle ConnectWithLocalAddress(rdpContext* context,
                                     const char* hostname,
                                     int port,
                                     DWORD timeout_ms,
                                     const std::string& local_address,
                                     std::string& last_error) {
  if (!hostname || local_address.empty()) {
    last_error = "hostname and localAddress are required";
    return kInvalidSocketHandle;
  }

  addrinfo hints = {};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;

  const std::string service = std::to_string(port);
  addrinfo* remote_result = nullptr;
  const int status =
      getaddrinfo(hostname, service.c_str(), &hints, &remote_result);
  if (status != 0) {
    last_error = "failed to resolve RDP host " + std::string(hostname) +
                 ": " + gai_strerror(status);
    freerdp_set_last_error_if_not(context, FREERDP_ERROR_DNS_NAME_NOT_FOUND);
    return kInvalidSocketHandle;
  }

  std::unique_ptr<addrinfo, decltype(&freeaddrinfo)> remote_addresses(
      remote_result, freeaddrinfo);
  for (addrinfo* remote = remote_addresses.get(); remote;
       remote = remote->ai_next) {
    const SocketHandle socket_handle =
        socket(remote->ai_family, remote->ai_socktype, remote->ai_protocol);
    if (IsInvalidSocketHandle(socket_handle)) {
      last_error = "socket failed: " + SocketErrorMessage(LastSocketError());
      continue;
    }

    if (!BindSocketToLocalAddress(socket_handle, remote->ai_family,
                                  local_address, last_error)) {
      CloseSocketHandle(socket_handle);
      continue;
    }

    if (ConnectSocketWithTimeout(socket_handle, remote->ai_addr,
                                 remote->ai_addrlen, timeout_ms, last_error)) {
      return socket_handle;
    }

    CloseSocketHandle(socket_handle);
  }

  freerdp_set_last_error_if_not(context, FREERDP_ERROR_CONNECT_FAILED);
  return kInvalidSocketHandle;
}

int LocalAddressTcpConnect(rdpContext* context,
                           rdpSettings* settings,
                           const char* hostname,
                           int port,
                           DWORD timeout_ms) {
  auto* bind_context = static_cast<LocalAddressTcpConnectContext*>(
      freerdp_get_io_callback_context(context));
  if (!bind_context || bind_context->local_address.empty()) {
    return -1;
  }

  std::string last_error;
  const SocketHandle socket_handle = ConnectWithLocalAddress(
      context, hostname, port, timeout_ms, bind_context->local_address,
      last_error);
  if (IsInvalidSocketHandle(socket_handle)) {
    std::fprintf(stderr,
                 "RDP localAddress connection failed (localAddress=%s, "
                 "target=%s:%d): %s\n",
                 bind_context->local_address.c_str(), hostname ? hostname : "",
                 port, last_error.c_str());
    std::fflush(stderr);
    return -1;
  }

  if (!SocketHandleFitsFreeRdpInt(socket_handle)) {
    std::fprintf(stderr,
                 "RDP localAddress connection failed (localAddress=%s, "
                 "target=%s:%d): socket handle exceeds FreeRDP transport "
                 "callback int range\n",
                 bind_context->local_address.c_str(), hostname ? hostname : "",
                 port);
    std::fflush(stderr);
    CloseSocketHandle(socket_handle);
    freerdp_set_last_error_if_not(context, FREERDP_ERROR_CONNECT_FAILED);
    return -1;
  }

  const int sockfd = SocketHandleToFreeRdpInt(socket_handle);
  if (!bind_context->default_io.TCPConnect) {
    return sockfd;
  }

  const int attached_sockfd = bind_context->default_io.TCPConnect(
      context, settings, "|midscene-bound-socket", sockfd, timeout_ms);
  if (attached_sockfd < 0) {
    CloseSocketHandle(socket_handle);
  }
  return attached_sockfd;
}

bool HasPendingFramebufferInvalidation(rdpContext* context) {
  if (!context || !context->gdi || !context->gdi->primary ||
      !context->gdi->primary->hdc || !context->gdi->primary->hdc->hwnd) {
    return false;
  }

  HGDI_WND hwnd = context->gdi->primary->hdc->hwnd;
  return hwnd->ninvalid > 0 && hwnd->invalid && !hwnd->invalid->null;
}

std::optional<RawFrame> CaptureInformativeFramebuffer(rdpContext* context) {
  if (!context || !context->gdi || !context->gdi->primary_buffer ||
      context->gdi->width <= 0 || context->gdi->height <= 0 ||
      context->gdi->stride == 0) {
    return std::nullopt;
  }

  rdpGdi* gdi = context->gdi;
  const auto width = static_cast<size_t>(gdi->width);
  const auto height = static_cast<size_t>(gdi->height);
  const auto stride = static_cast<size_t>(gdi->stride);
  if (stride < width * 4) {
    return std::nullopt;
  }

  const BYTE* buffer = gdi->primary_buffer;
  const size_t total_pixels = width * height;
  const size_t min_non_black_pixels =
      std::max<size_t>(
          1, (total_pixels * kMinInformativeNonBlackPermille) / 1000);
  size_t non_black_pixels = 0;
  std::unordered_set<uint32_t> colors;
  colors.reserve(kMinInformativeColorCount);
  for (size_t y = 0; y < height; y++) {
    const size_t row_offset = y * stride;
    for (size_t x = 0; x < width; x++) {
      const size_t pixel_offset = row_offset + x * 4;
      const BYTE blue = buffer[pixel_offset];
      const BYTE green = buffer[pixel_offset + 1];
      const BYTE red = buffer[pixel_offset + 2];
      if (blue == 0 && green == 0 && red == 0) {
        continue;
      }

      non_black_pixels++;
      const uint32_t color =
          (static_cast<uint32_t>(red) << 16) |
          (static_cast<uint32_t>(green) << 8) |
          static_cast<uint32_t>(blue);
      colors.insert(color);
      if (colors.size() >= kMinInformativeColorCount &&
          non_black_pixels >= min_non_black_pixels) {
        break;
      }
    }
    if (colors.size() >= kMinInformativeColorCount &&
        non_black_pixels >= min_non_black_pixels) {
      break;
    }
  }

  if (colors.size() < kMinInformativeColorCount ||
      non_black_pixels < min_non_black_pixels) {
    return std::nullopt;
  }

  RawFrame frame;
  frame.size.width = gdi->width;
  frame.size.height = gdi->height;
  frame.stride = stride;
  const size_t buffer_size = stride * height;
  frame.bgra.assign(buffer, buffer + buffer_size);
  return frame;
}

// EndPaint hook chained onto FreeRDP's update pipeline. FreeRDP invokes this
// after an update PDU; only paints with a GDI invalid region and informative
// primary framebuffer prove that desktop pixels reached the client.
BOOL MidsceneEndPaint(rdpContext* context) {
  auto* typed_context = reinterpret_cast<MidsceneRdpContext*>(context);
  BOOL ok = TRUE;
  if (typed_context->owner) {
    const bool framebuffer_invalidated =
        HasPendingFramebufferInvalidation(context);
    ok = typed_context->owner->CallOriginalEndPaint(context);
    const bool already_painted = typed_context->owner->HasFramePainted();
    if (ok && framebuffer_invalidated) {
      if (already_painted) {
        typed_context->owner->MarkFramePainted();
      } else if (auto first_frame = CaptureInformativeFramebuffer(context);
                 first_frame.has_value()) {
        typed_context->owner->MarkFramePainted(std::move(first_frame));
      }
    }
  }
  return ok;
}

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

std::string FormatServerAddress(std::string_view host, UINT32 port) {
  std::ostringstream server;
  if (host.find(':') != std::string_view::npos &&
      !(host.size() >= 2 && host.front() == '[' && host.back() == ']')) {
    server << '[' << host << ']';
  } else {
    server << host;
  }
  server << ':' << port;
  return server.str();
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
    // Chain our hook after GDI update callbacks are installed so Connect() can
    // wait for the first paint that actually touches the primary framebuffer.
    typed_context->owner->HookEndPaint(instance->context->update);
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

  std::optional<LocalAddressTcpConnectContext> local_bind_context;
  rdpTransportIo local_bind_io = {};
  if (!config.local_address.empty()) {
    const rdpTransportIo* default_io = freerdp_get_io_callbacks(instance->context);
    if (!default_io) {
      freerdp_context_free(instance);
      freerdp_free(instance);
      throw std::runtime_error("Failed to read FreeRDP transport callbacks");
    }
    local_bind_context.emplace(
        LocalAddressTcpConnectContext{config.local_address, *default_io});
    local_bind_io = *default_io;
    local_bind_io.TCPConnect = LocalAddressTcpConnect;
    if (!freerdp_set_io_callback_context(instance->context,
                                         &local_bind_context.value()) ||
        !freerdp_set_io_callbacks(instance->context, &local_bind_io)) {
      freerdp_context_free(instance);
      freerdp_free(instance);
      throw std::runtime_error(
          "Failed to configure FreeRDP localAddress TCP binding");
    }
  }

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
    frames_painted_.store(0, std::memory_order_relaxed);
    {
      std::lock_guard<std::mutex> frame_lock(frame_mutex_);
      first_frame_.reset();
      first_frame_consumed_ = false;
    }
    original_end_paint_ = nullptr;
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
    info.server = FormatServerAddress(host ? host : "", port);
    if (instance_->context && instance_->context->gdi) {
      info.size.width = instance_->context->gdi->width;
      info.size.height = instance_->context->gdi->height;
    }
  }

  session_active_.store(true, std::memory_order_relaxed);
  event_thread_ = std::thread(&FreeRdpSessionTransport::EventLoop, this);

  // Block until the remote desktop paints its first frame. Without this the
  // primary buffer is still zero-filled (all black) and an immediate
  // screenshot would hand the caller a blank image, which the agent reads as
  // "nothing on screen" and aborts. This race is the root cause of the
  // intermittent blank-screenshot failures.
  bool painted = false;
  {
    std::unique_lock<std::mutex> frame_lock(frame_mutex_);
    painted = frame_cv_.wait_for(
        frame_lock, std::chrono::milliseconds(kFirstFrameTimeoutMs),
        [this] {
          return frames_painted_.load(std::memory_order_relaxed) > 0 ||
                 !session_active_.load(std::memory_order_relaxed);
        });
  }

  // A wait that ended without a frame because the session dropped should
  // surface as a failure, not a false "painted" success.
  if (frames_painted_.load(std::memory_order_relaxed) == 0) {
    painted = false;
  }

  if (!painted) {
    std::string reason;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      reason = connected_ ? std::string() : LastFreeRdpErrorLocked();
    }
    StopInstance(false);
    std::string message =
        "Connected to the RDP server but received no desktop frame within "
        "timeout; the remote desktop may be blank or locked";
    if (!reason.empty()) {
      message += " (" + reason + ")";
    }
    throw std::runtime_error(message);
  }

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

  if (frames_painted_.load(std::memory_order_relaxed) == 0) {
    throw std::runtime_error(
        "Remote framebuffer has not received its first paint yet");
  }

  {
    std::lock_guard<std::mutex> frame_lock(frame_mutex_);
    if (!first_frame_consumed_ && first_frame_.has_value()) {
      first_frame_consumed_ = true;
      return *first_frame_;
    }
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
  frames_painted_.store(0, std::memory_order_relaxed);
  {
    std::lock_guard<std::mutex> frame_lock(frame_mutex_);
    first_frame_.reset();
    first_frame_consumed_ = false;
  }
  original_end_paint_ = nullptr;
  mouse_x_ = 0;
  mouse_y_ = 0;
  session_id_.clear();
}

void FreeRdpSessionTransport::MarkGdiInitialized() {
  gdi_initialized_ = true;
}

void FreeRdpSessionTransport::HookEndPaint(rdpUpdate* update) {
  if (!update) {
    return;
  }
  original_end_paint_ = update->EndPaint;
  update->EndPaint = &MidsceneEndPaint;
}

BOOL FreeRdpSessionTransport::CallOriginalEndPaint(rdpContext* context) {
  if (original_end_paint_) {
    return original_end_paint_(context);
  }
  return TRUE;
}

void FreeRdpSessionTransport::MarkFramePainted(
    std::optional<RawFrame> first_frame) {
  {
    std::lock_guard<std::mutex> lock(frame_mutex_);
    if (first_frame.has_value() &&
        frames_painted_.load(std::memory_order_relaxed) == 0 &&
        !first_frame_.has_value()) {
      first_frame_ = std::move(*first_frame);
      first_frame_consumed_ = false;
    }
    frames_painted_.fetch_add(1, std::memory_order_relaxed);
  }
  frame_cv_.notify_all();
}

bool FreeRdpSessionTransport::HasFramePainted() const {
  return frames_painted_.load(std::memory_order_relaxed) > 0;
}

void FreeRdpSessionTransport::SignalSessionInactive() {
  {
    std::lock_guard<std::mutex> lock(frame_mutex_);
    session_active_.store(false, std::memory_order_relaxed);
  }
  frame_cv_.notify_all();
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

  SignalSessionInactive();

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
      SignalSessionInactive();
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
      SignalSessionInactive();
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
      SignalSessionInactive();
      return;
    }
  }
}

}  // namespace midscene::rdp
