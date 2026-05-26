#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <string_view>

#include "rdp_helper_protocol.hpp"

namespace midscene::rdp {

class JsonValue {
 public:
  enum class Type {
    kNull,
    kBool,
    kNumber,
    kString,
    kObject,
  };

  using Object = std::map<std::string, JsonValue>;

  JsonValue();
  JsonValue(std::nullptr_t);
  JsonValue(bool value);
  JsonValue(int32_t value);
  JsonValue(uint32_t value);
  JsonValue(double value);
  JsonValue(std::string value);
  JsonValue(std::string_view value);
  JsonValue(const char* value);
  JsonValue(Object value);

  Type type() const;
  bool IsNull() const;
  bool IsBool() const;
  bool IsNumber() const;
  bool IsString() const;
  bool IsObject() const;

  bool AsBool() const;
  double AsNumber() const;
  const std::string& AsString() const;
  const Object& AsObject() const;
  Object& AsObject();

 private:
  Type type_ = Type::kNull;
  bool bool_value_ = false;
  double number_value_ = 0;
  std::string string_value_;
  Object object_value_;
};

using JsonObject = JsonValue::Object;

struct ParsedRequest {
  std::string id;
  RequestType type = RequestType::kUnknown;
  JsonObject payload;
};

std::string EscapeJsonString(std::string_view value);
std::string ExtractRequestId(std::string_view line);
std::optional<ParsedRequest> ParseRequestLine(std::string_view line);

std::optional<std::string> GetStringField(const JsonObject& object,
                                          std::string_view key);
std::optional<int32_t> GetIntField(const JsonObject& object, std::string_view key);
std::optional<uint16_t> GetUInt16Field(const JsonObject& object,
                                       std::string_view key);
std::optional<bool> GetBoolField(const JsonObject& object, std::string_view key);
const JsonObject* GetObjectField(const JsonObject& object, std::string_view key);

std::string SerializeJson(const JsonValue& value);
std::string MakeErrorResponse(std::string_view request_id,
                              std::string_view code,
                              std::string_view message);
std::string MakeOkResponse(std::string_view request_id, const JsonValue& payload);

}  // namespace midscene::rdp
