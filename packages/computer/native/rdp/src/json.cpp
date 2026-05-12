#include "rdp_helper_json.hpp"

#include <cmath>
#include <cstdint>
#include <sstream>
#include <stdexcept>

namespace midscene::rdp {

JsonValue::JsonValue() = default;

JsonValue::JsonValue(std::nullptr_t) {}

JsonValue::JsonValue(bool value) : type_(Type::kBool), bool_value_(value) {}

JsonValue::JsonValue(int32_t value)
    : type_(Type::kNumber), number_value_(static_cast<double>(value)) {}

JsonValue::JsonValue(uint32_t value)
    : type_(Type::kNumber), number_value_(static_cast<double>(value)) {}

JsonValue::JsonValue(double value) : type_(Type::kNumber), number_value_(value) {}

JsonValue::JsonValue(std::string value)
    : type_(Type::kString), string_value_(std::move(value)) {}

JsonValue::JsonValue(std::string_view value)
    : type_(Type::kString), string_value_(value) {}

JsonValue::JsonValue(const char* value)
    : type_(Type::kString), string_value_(value ? value : "") {}

JsonValue::JsonValue(Object value)
    : type_(Type::kObject), object_value_(std::move(value)) {}

JsonValue::Type JsonValue::type() const {
  return type_;
}

bool JsonValue::IsNull() const {
  return type_ == Type::kNull;
}

bool JsonValue::IsBool() const {
  return type_ == Type::kBool;
}

bool JsonValue::IsNumber() const {
  return type_ == Type::kNumber;
}

bool JsonValue::IsString() const {
  return type_ == Type::kString;
}

bool JsonValue::IsObject() const {
  return type_ == Type::kObject;
}

bool JsonValue::AsBool() const {
  return bool_value_;
}

double JsonValue::AsNumber() const {
  return number_value_;
}

const std::string& JsonValue::AsString() const {
  return string_value_;
}

const JsonValue::Object& JsonValue::AsObject() const {
  return object_value_;
}

JsonValue::Object& JsonValue::AsObject() {
  return object_value_;
}

namespace {

class JsonParser {
 public:
  explicit JsonParser(std::string_view input) : input_(input) {}

  JsonValue Parse() {
    SkipWhitespace();
    JsonValue value = ParseValue();
    SkipWhitespace();
    if (position_ != input_.size()) {
      throw std::runtime_error("Unexpected trailing data in helper request");
    }
    return value;
  }

 private:
  JsonValue ParseValue() {
    if (position_ >= input_.size()) {
      throw std::runtime_error("Unexpected end of helper request");
    }

    const char ch = input_[position_];
    if (ch == '{') {
      return JsonValue(ParseObject());
    }
    if (ch == '"') {
      return JsonValue(ParseString());
    }
    if (ch == '-' || (ch >= '0' && ch <= '9')) {
      return JsonValue(ParseNumber());
    }
    if (MatchLiteral("true")) {
      return JsonValue(true);
    }
    if (MatchLiteral("false")) {
      return JsonValue(false);
    }
    if (MatchLiteral("null")) {
      return JsonValue(nullptr);
    }

    throw std::runtime_error("Unexpected token in helper request JSON");
  }

  JsonObject ParseObject() {
    Expect('{');
    SkipWhitespace();

    JsonObject object;
    if (Peek('}')) {
      position_++;
      return object;
    }

    while (position_ < input_.size()) {
      SkipWhitespace();
      std::string key = ParseString();
      SkipWhitespace();
      Expect(':');
      SkipWhitespace();
      object.emplace(std::move(key), ParseValue());
      SkipWhitespace();

      if (Peek('}')) {
        position_++;
        return object;
      }

      Expect(',');
      SkipWhitespace();
    }

    throw std::runtime_error("Unterminated helper request object");
  }

  std::string ParseString() {
    Expect('"');

    std::string value;
    while (position_ < input_.size()) {
      const char ch = input_[position_++];
      if (ch == '"') {
        return value;
      }

      if (ch != '\\') {
        value.push_back(ch);
        continue;
      }

      if (position_ >= input_.size()) {
        throw std::runtime_error("Invalid string escape in helper request");
      }

      const char escaped = input_[position_++];
      switch (escaped) {
        case '"':
          value.push_back('"');
          break;
        case '\\':
          value.push_back('\\');
          break;
        case '/':
          value.push_back('/');
          break;
        case 'b':
          value.push_back('\b');
          break;
        case 'f':
          value.push_back('\f');
          break;
        case 'n':
          value.push_back('\n');
          break;
        case 'r':
          value.push_back('\r');
          break;
        case 't':
          value.push_back('\t');
          break;
        case 'u':
          AppendUnicodeEscape(value);
          break;
        default:
          throw std::runtime_error("Unsupported string escape in helper request");
      }
    }

    throw std::runtime_error("Unterminated string in helper request");
  }

  double ParseNumber() {
    const size_t start = position_;
    if (Peek('-')) {
      position_++;
    }

    ConsumeDigits();

    if (Peek('.')) {
      position_++;
      ConsumeDigits();
    }

    if (Peek('e') || Peek('E')) {
      position_++;
      if (Peek('+') || Peek('-')) {
        position_++;
      }
      ConsumeDigits();
    }

    return std::stod(std::string(input_.substr(start, position_ - start)));
  }

  void ConsumeDigits() {
    const size_t start = position_;
    while (position_ < input_.size() && input_[position_] >= '0' &&
           input_[position_] <= '9') {
      position_++;
    }

    if (start == position_) {
      throw std::runtime_error("Expected digits in helper request number");
    }
  }

  void AppendUnicodeEscape(std::string& value) {
    const uint32_t codepoint = ParseHexQuad();
    if (codepoint <= 0x7F) {
      value.push_back(static_cast<char>(codepoint));
      return;
    }
    if (codepoint <= 0x7FF) {
      value.push_back(static_cast<char>(0xC0 | (codepoint >> 6)));
      value.push_back(static_cast<char>(0x80 | (codepoint & 0x3F)));
      return;
    }
    value.push_back(static_cast<char>(0xE0 | (codepoint >> 12)));
    value.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F)));
    value.push_back(static_cast<char>(0x80 | (codepoint & 0x3F)));
  }

  uint32_t ParseHexQuad() {
    if (position_ + 4 > input_.size()) {
      throw std::runtime_error("Invalid unicode escape in helper request");
    }

    uint32_t value = 0;
    for (size_t index = 0; index < 4; index++) {
      value <<= 4;
      const char ch = input_[position_++];
      if (ch >= '0' && ch <= '9') {
        value |= static_cast<uint32_t>(ch - '0');
      } else if (ch >= 'a' && ch <= 'f') {
        value |= static_cast<uint32_t>(10 + ch - 'a');
      } else if (ch >= 'A' && ch <= 'F') {
        value |= static_cast<uint32_t>(10 + ch - 'A');
      } else {
        throw std::runtime_error("Invalid unicode escape in helper request");
      }
    }

    return value;
  }

  bool MatchLiteral(std::string_view literal) {
    if (input_.substr(position_, literal.size()) != literal) {
      return false;
    }

    position_ += literal.size();
    return true;
  }

  void SkipWhitespace() {
    while (position_ < input_.size()) {
      const char ch = input_[position_];
      if (ch == ' ' || ch == '\n' || ch == '\r' || ch == '\t') {
        position_++;
        continue;
      }
      break;
    }
  }

  void Expect(char expected) {
    if (position_ >= input_.size() || input_[position_] != expected) {
      throw std::runtime_error("Malformed helper request JSON");
    }
    position_++;
  }

  bool Peek(char expected) const {
    return position_ < input_.size() && input_[position_] == expected;
  }

  std::string_view input_;
  size_t position_ = 0;
};

const JsonValue* FindField(const JsonObject& object, std::string_view key) {
  const auto iterator = object.find(std::string(key));
  if (iterator == object.end()) {
    return nullptr;
  }
  return &iterator->second;
}

std::string SerializeObject(const JsonObject& object);

std::string SerializeNumber(double value) {
  if (std::isfinite(value) && std::floor(value) == value) {
    std::ostringstream stream;
    stream << static_cast<int64_t>(value);
    return stream.str();
  }

  std::ostringstream stream;
  stream.precision(15);
  stream << value;
  return stream.str();
}

std::string SerializeObject(const JsonObject& object) {
  std::ostringstream stream;
  stream << '{';
  bool first = true;
  for (const auto& [key, value] : object) {
    if (!first) {
      stream << ',';
    }
    first = false;
    stream << '"' << EscapeJsonString(key) << "\":" << SerializeJson(value);
  }
  stream << '}';
  return stream.str();
}

}  // namespace

std::string EscapeJsonString(std::string_view value) {
  std::ostringstream escaped;
  for (const unsigned char ch : value) {
    switch (ch) {
      case '\\':
        escaped << "\\\\";
        break;
      case '"':
        escaped << "\\\"";
        break;
      case '\n':
        escaped << "\\n";
        break;
      case '\r':
        escaped << "\\r";
        break;
      case '\t':
        escaped << "\\t";
        break;
      default:
        if (ch < 0x20) {
          escaped << "\\u00";
          const char digits[] = "0123456789abcdef";
          escaped << digits[(ch >> 4) & 0x0F] << digits[ch & 0x0F];
        } else {
          escaped << static_cast<char>(ch);
        }
        break;
    }
  }
  return escaped.str();
}

std::string ExtractRequestId(std::string_view line) {
  constexpr std::string_view needle = "\"id\"";
  const size_t key_position = line.find(needle);
  if (key_position == std::string_view::npos) {
    return "";
  }

  const size_t colon_position = line.find(':', key_position + needle.size());
  if (colon_position == std::string_view::npos) {
    return "";
  }

  const size_t first_quote = line.find('"', colon_position + 1);
  if (first_quote == std::string_view::npos) {
    return "";
  }

  size_t second_quote = first_quote + 1;
  bool escaped = false;
  for (; second_quote < line.size(); second_quote++) {
    const char ch = line[second_quote];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch == '\\') {
      escaped = true;
      continue;
    }
    if (ch == '"') {
      break;
    }
  }

  if (second_quote >= line.size()) {
    return "";
  }

  return std::string(line.substr(first_quote + 1, second_quote - first_quote - 1));
}

std::optional<ParsedRequest> ParseRequestLine(std::string_view line) {
  JsonParser parser(line);
  JsonValue root = parser.Parse();
  if (!root.IsObject()) {
    return std::nullopt;
  }

  const JsonObject& request_object = root.AsObject();
  const auto request_id = GetStringField(request_object, "id");
  const JsonObject* payload = GetObjectField(request_object, "payload");
  if (!request_id.has_value() || !payload) {
    return std::nullopt;
  }

  const auto type_name = GetStringField(*payload, "type");
  if (!type_name.has_value()) {
    return std::nullopt;
  }

  return ParsedRequest{
      *request_id,
      ParseRequestType(*type_name).value_or(RequestType::kUnknown),
      *payload,
  };
}

std::optional<std::string> GetStringField(const JsonObject& object,
                                          std::string_view key) {
  const JsonValue* value = FindField(object, key);
  if (!value || !value->IsString()) {
    return std::nullopt;
  }
  return value->AsString();
}

std::optional<int32_t> GetIntField(const JsonObject& object, std::string_view key) {
  const JsonValue* value = FindField(object, key);
  if (!value || !value->IsNumber()) {
    return std::nullopt;
  }

  return static_cast<int32_t>(std::llround(value->AsNumber()));
}

std::optional<uint16_t> GetUInt16Field(const JsonObject& object,
                                       std::string_view key) {
  const auto parsed = GetIntField(object, key);
  if (!parsed.has_value() || *parsed < 0 || *parsed > 65535) {
    return std::nullopt;
  }
  return static_cast<uint16_t>(*parsed);
}

std::optional<bool> GetBoolField(const JsonObject& object, std::string_view key) {
  const JsonValue* value = FindField(object, key);
  if (!value || !value->IsBool()) {
    return std::nullopt;
  }
  return value->AsBool();
}

const JsonObject* GetObjectField(const JsonObject& object, std::string_view key) {
  const JsonValue* value = FindField(object, key);
  if (!value || !value->IsObject()) {
    return nullptr;
  }
  return &value->AsObject();
}

std::string SerializeJson(const JsonValue& value) {
  switch (value.type()) {
    case JsonValue::Type::kNull:
      return "null";
    case JsonValue::Type::kBool:
      return value.AsBool() ? "true" : "false";
    case JsonValue::Type::kNumber:
      return SerializeNumber(value.AsNumber());
    case JsonValue::Type::kString:
      return "\"" + EscapeJsonString(value.AsString()) + "\"";
    case JsonValue::Type::kObject:
      return SerializeObject(value.AsObject());
  }

  throw std::runtime_error("Unsupported JSON value type");
}

std::string MakeErrorResponse(std::string_view request_id,
                              std::string_view code,
                              std::string_view message) {
  JsonObject error;
  error.emplace("code", JsonValue(code));
  error.emplace("message", JsonValue(message));

  JsonObject response;
  response.emplace("id", JsonValue(request_id));
  response.emplace("ok", JsonValue(false));
  response.emplace("error", JsonValue(std::move(error)));
  return SerializeJson(JsonValue(std::move(response)));
}

std::string MakeOkResponse(std::string_view request_id, const JsonValue& payload) {
  JsonObject response;
  response.emplace("id", JsonValue(request_id));
  response.emplace("ok", JsonValue(true));
  response.emplace("payload", payload);
  return SerializeJson(JsonValue(std::move(response)));
}

}  // namespace midscene::rdp
