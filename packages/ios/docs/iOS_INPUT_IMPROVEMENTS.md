# iOS Input Implementation Improvements

## 问题描述
iOS的aiInput之前存在问题，因为Android可以调用adb直接输入，但iOS只能通过模拟键盘输入来实现。这导致了输入不稳定、字符丢失等问题。

## 解决方案

### 1. 优化的输入流程
新的iOS输入实现包含以下步骤：

1. **聚焦输入框**: 先点击输入框来获得焦点
2. **清空现有内容**: 使用Cmd+A选择全部，然后删除
3. **字符间隔输入**: 使用适当的间隔时间逐字符输入
4. **自动关闭键盘**: 输入完成后自动关闭键盘

### 2. Python服务器改进
- 添加了`ios_input`动作类型，专门处理iOS输入
- 支持`interval`参数，控制字符间输入间隔
- 为iOS设置默认的最小间隔时间(20ms)以确保字符正确输入

### 3. TypeScript实现改进
- 添加了`aiInputIOS`方法，提供专门的iOS输入处理
- 更新了`clearInput`方法，先点击聚焦再清空
- 添加了`dismissKeyboard`方法，自动关闭iOS键盘
- 在任务执行器中添加了iOS特定的输入逻辑

## 新增功能

### PyAutoGUI服务器新动作
```python
{
    "action": "ios_input",
    "x": 100,           # 输入框的x坐标（可选）
    "y": 200,           # 输入框的y坐标（可选）
    "text": "Hello",    # 要输入的文本
    "interval": 0.05,   # 字符间间隔（秒）
    "clear_first": true # 是否先清空现有内容
}
```

### iOS设备新方法
```typescript
// 专门的iOS输入方法
await iosDevice.aiInputIOS(text, element, options);

// 改进的键盘关闭方法
await iosDevice.dismissKeyboard();

// 改进的清空输入方法
await iosDevice.clearInput(element);
```

## 使用示例

### YAML配置示例
```yaml
ios:
  serverUrl: "http://localhost:1412"
  autoDismissKeyboard: true
  mirrorConfig:
    mirrorX: 692
    mirrorY: 161
    mirrorWidth: 344
    mirrorHeight: 764

tasks:
  - name: Test iOS input
    flow:
      - aiAction: "Open Notes app"
      - aiInput: "This text will be input properly on iOS"
      - aiAssert: "Text is entered correctly"
```

### 编程接口示例
```typescript
const agent = await agentFromPyAutoGUI({
  serverPort: 1412,
  autoDismissKeyboard: true,
  mirrorConfig: {
    mirrorX: 692,
    mirrorY: 161,
    mirrorWidth: 344,
    mirrorHeight: 764,
  },
});

// 使用aiInput，现在对iOS优化
await agent.aiInput('Hello iOS!', 'in the text input field');
```

## 技术改进细节

### 1. 字符间隔控制
- 默认间隔: 20ms (Android的adb输入不需要间隔)
- 可配置间隔: 通过`interval`参数自定义
- 自动调整: 为iOS设备自动设置合适的默认值

### 2. 聚焦处理
- 自动点击: 在输入前先点击输入框获得焦点
- 等待时间: 点击后等待300ms确保焦点获得
- 坐标转换: 自动处理iOS到macOS的坐标转换

### 3. 键盘管理
- 自动关闭: 输入完成后自动关闭iOS键盘
- 多种方法: 尝试Return键或点击键盘外区域
- 可配置: 通过`autoDismissKeyboard`选项控制

### 4. 错误处理
- 优雅降级: 如果特殊方法失败，回退到基本方法
- 日志记录: 详细的调试日志帮助排查问题
- 类型安全: 通过TypeScript类型检查确保正确使用

## 测试
运行测试脚本验证功能：
```bash
cd packages/ios
npm run test:input
```

## 兼容性
- ✅ iOS模拟器
- ✅ iOS真机（通过屏幕镜像）
- ✅ 向后兼容现有API
- ✅ 支持中文输入
- ✅ 支持特殊字符

## 性能优化
- 减少不必要的延迟
- 优化字符输入速度
- 智能键盘关闭策略
- 高效的坐标转换
