#include <cstdio>
#include <iostream>
#include <string>

#include <winpr/wlog.h>

#include "rdp_helper_json.hpp"
#include "rdp_helper_png.hpp"
#include "rdp_helper_session.hpp"

namespace midscene::rdp {

namespace {

ConnectionConfig ParseConnectionConfig(const JsonObject& payload) {
  const JsonObject* config = GetObjectField(payload, "config");
  if (!config) {
    throw std::runtime_error("connect.config must be an object");
  }

  const auto host = GetStringField(*config, "host");
  if (!host.has_value() || host->empty()) {
    throw std::runtime_error("connect.config.host is required");
  }

  ConnectionConfig parsed;
  parsed.host = *host;
  if (const auto port = GetIntField(*config, "port"); port.has_value()) {
    parsed.port = static_cast<uint16_t>(*port);
  }
  if (const auto username = GetStringField(*config, "username"); username.has_value()) {
    parsed.username = *username;
  }
  if (const auto password = GetStringField(*config, "password"); password.has_value()) {
    parsed.password = *password;
  }
  if (const auto domain = GetStringField(*config, "domain"); domain.has_value()) {
    parsed.domain = *domain;
  }
  if (const auto admin_session = GetBoolField(*config, "adminSession");
      admin_session.has_value()) {
    parsed.admin_session = *admin_session;
  }
  if (const auto ignore_certificate = GetBoolField(*config, "ignoreCertificate");
      ignore_certificate.has_value()) {
    parsed.ignore_certificate = *ignore_certificate;
  }
  if (const auto security_protocol = GetStringField(*config, "securityProtocol");
      security_protocol.has_value()) {
    parsed.security_protocol = *security_protocol;
  }
  if (const auto width = GetIntField(*config, "desktopWidth"); width.has_value()) {
    parsed.desktop_width = *width;
  }
  if (const auto height = GetIntField(*config, "desktopHeight"); height.has_value()) {
    parsed.desktop_height = *height;
  }

  return parsed;
}

std::optional<std::string> EnsureConnectedResponse(const std::string& request_id,
                                                   const SessionTransport& transport) {
  if (transport.IsConnected()) {
    return std::nullopt;
  }

  if (const auto last_error = transport.LastError(); last_error.has_value()) {
    return MakeErrorResponse(request_id, last_error->code, last_error->message);
  }

  return MakeErrorResponse(request_id, "not_connected", "RDP session is not connected");
}

JsonValue MakeConnectedPayload(const ConnectionInfo& info) {
  JsonObject size;
  size.emplace("width", JsonValue(info.size.width));
  size.emplace("height", JsonValue(info.size.height));

  JsonObject details;
  details.emplace("sessionId", JsonValue(info.session_id));
  details.emplace("server", JsonValue(info.server));
  details.emplace("size", JsonValue(std::move(size)));

  JsonObject payload;
  payload.emplace("type", JsonValue("connected"));
  payload.emplace("info", JsonValue(std::move(details)));
  return JsonValue(std::move(payload));
}

JsonValue MakeOkPayload() {
  JsonObject payload;
  payload.emplace("type", JsonValue("ok"));
  return JsonValue(std::move(payload));
}

JsonValue MakeSizePayload(const Size& size) {
  JsonObject size_payload;
  size_payload.emplace("width", JsonValue(size.width));
  size_payload.emplace("height", JsonValue(size.height));

  JsonObject payload;
  payload.emplace("type", JsonValue("size"));
  payload.emplace("size", JsonValue(std::move(size_payload)));
  return JsonValue(std::move(payload));
}

JsonValue MakeScreenshotPayload(const std::string& base64) {
  JsonObject payload;
  payload.emplace("type", JsonValue("screenshot"));
  payload.emplace("base64", JsonValue(base64));
  return JsonValue(std::move(payload));
}

}  // namespace

std::string HandleRequest(const ParsedRequest& request,
                          FreeRdpSessionTransport& transport) {
  switch (request.type) {
    case RequestType::kConnect: {
      if (transport.IsConnected()) {
        return MakeErrorResponse(request.id, "already_connected",
                                 "RDP session is already connected");
      }

      try {
        const ConnectionInfo info = transport.Connect(ParseConnectionConfig(request.payload));
        return MakeOkResponse(request.id, MakeConnectedPayload(info));
      } catch (const std::exception& error) {
        return MakeErrorResponse(request.id, "connect_failed", error.what());
      }
    }

    case RequestType::kDisconnect:
      transport.Disconnect();
      return MakeOkResponse(request.id, MakeOkPayload());

    case RequestType::kSize: {
      if (const auto error = EnsureConnectedResponse(request.id, transport);
          error.has_value()) {
        return *error;
      }
      return MakeOkResponse(request.id, MakeSizePayload(transport.GetSize()));
    }

    case RequestType::kScreenshot: {
      if (const auto error = EnsureConnectedResponse(request.id, transport);
          error.has_value()) {
        return *error;
      }
      try {
        const RawFrame frame = transport.CaptureFrame();
        const std::vector<uint8_t> png = EncodeFrameAsPng(frame);
        const std::string encoded =
            "data:image/png;base64," + EncodeBase64(png);
        return MakeOkResponse(request.id, MakeScreenshotPayload(encoded));
      } catch (const std::exception& error) {
        return MakeErrorResponse(request.id, "screenshot_failed", error.what());
      }
    }

    case RequestType::kMouseMove: {
      if (const auto error = EnsureConnectedResponse(request.id, transport);
          error.has_value()) {
        return *error;
      }
      const auto x = GetUInt16Field(request.payload, "x");
      const auto y = GetUInt16Field(request.payload, "y");
      if (!x.has_value() || !y.has_value()) {
        return MakeErrorResponse(request.id, "invalid_request",
                                 "mouseMove requires numeric x and y");
      }
      try {
        transport.MouseMove(*x, *y);
        return MakeOkResponse(request.id, MakeOkPayload());
      } catch (const std::exception& error) {
        return MakeErrorResponse(request.id, "mouse_move_failed", error.what());
      }
    }

    case RequestType::kMouseButton: {
      if (const auto error = EnsureConnectedResponse(request.id, transport);
          error.has_value()) {
        return *error;
      }
      const auto button = GetStringField(request.payload, "button");
      const auto action = GetStringField(request.payload, "action");
      if (!button.has_value() || !action.has_value()) {
        return MakeErrorResponse(request.id, "invalid_request",
                                 "mouseButton requires button and action");
      }
      try {
        transport.MouseButton(*button, *action);
        return MakeOkResponse(request.id, MakeOkPayload());
      } catch (const std::exception& error) {
        return MakeErrorResponse(request.id, "mouse_button_failed", error.what());
      }
    }

    case RequestType::kWheel: {
      if (const auto error = EnsureConnectedResponse(request.id, transport);
          error.has_value()) {
        return *error;
      }
      const auto direction = GetStringField(request.payload, "direction");
      const auto amount = GetIntField(request.payload, "amount");
      if (!direction.has_value() || !amount.has_value()) {
        return MakeErrorResponse(request.id, "invalid_request",
                                 "wheel requires direction and amount");
      }
      try {
        transport.Wheel(*direction, *amount, GetUInt16Field(request.payload, "x"),
                        GetUInt16Field(request.payload, "y"));
        return MakeOkResponse(request.id, MakeOkPayload());
      } catch (const std::exception& error) {
        return MakeErrorResponse(request.id, "wheel_failed", error.what());
      }
    }

    case RequestType::kKeyPress: {
      if (const auto error = EnsureConnectedResponse(request.id, transport);
          error.has_value()) {
        return *error;
      }
      const auto key_name = GetStringField(request.payload, "keyName");
      if (!key_name.has_value() || key_name->empty()) {
        return MakeErrorResponse(request.id, "invalid_request",
                                 "keyPress requires keyName");
      }
      try {
        transport.KeyPress(*key_name);
        return MakeOkResponse(request.id, MakeOkPayload());
      } catch (const std::exception& error) {
        return MakeErrorResponse(request.id, "keypress_failed", error.what());
      }
    }

    case RequestType::kTypeText: {
      if (const auto error = EnsureConnectedResponse(request.id, transport);
          error.has_value()) {
        return *error;
      }
      const auto text = GetStringField(request.payload, "text");
      if (!text.has_value()) {
        return MakeErrorResponse(request.id, "invalid_request",
                                 "typeText requires text");
      }
      try {
        transport.TypeText(*text);
        return MakeOkResponse(request.id, MakeOkPayload());
      } catch (const std::exception& error) {
        return MakeErrorResponse(request.id, "type_text_failed", error.what());
      }
    }

    case RequestType::kClearInput: {
      if (const auto error = EnsureConnectedResponse(request.id, transport);
          error.has_value()) {
        return *error;
      }
      try {
        transport.ClearInput();
        return MakeOkResponse(request.id, MakeOkPayload());
      } catch (const std::exception& error) {
        return MakeErrorResponse(request.id, "clear_input_failed", error.what());
      }
    }

    case RequestType::kUnknown:
      return MakeErrorResponse(
          request.id,
          "unsupported_request",
          "Unsupported RDP helper request type");
  }

  return MakeErrorResponse(request.id, "unsupported_request",
                           "Unsupported RDP helper request type");
}

}  // namespace midscene::rdp

int main() {
  WLog_SetLogLevel(WLog_GetRoot(), WLOG_OFF);

  midscene::rdp::FreeRdpSessionTransport transport;
  std::string line;
  while (std::getline(std::cin, line)) {
    const auto request = midscene::rdp::ParseRequestLine(line);
    const std::string request_id =
        request.has_value() ? request->id : midscene::rdp::ExtractRequestId(line);

    if (!request.has_value()) {
      std::fprintf(stderr, "Failed to parse helper request JSON\n");
      std::fflush(stderr);
      continue;
    }

    std::cout << midscene::rdp::HandleRequest(*request, transport) << '\n';
    std::cout.flush();
  }

  transport.Disconnect();
  return 0;
}
