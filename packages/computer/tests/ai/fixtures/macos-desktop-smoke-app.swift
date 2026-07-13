import AppKit
import Foundation

final class FlippedDocumentView: NSView {
  override var isFlipped: Bool { true }
}

@MainActor
final class SmokeButton: NSButton {
  var onMouseDown: (() -> Void)?

  override func mouseDown(with event: NSEvent) {
    onMouseDown?()
    super.mouseDown(with: event)
  }
}

@MainActor
final class FixtureController: NSObject, NSApplicationDelegate, NSTextFieldDelegate {
  private let readyURL: URL
  private let stateURL: URL

  private var window: NSWindow!
  private var button: SmokeButton!
  private var textField: NSTextField!
  private var scrollView: NSScrollView!
  private var activationTimer: Timer?

  private var clickCount = 0
  private var buttonActionCount = 0
  private var lastKey = ""
  private var wheelEventCount = 0

  init(readyFile: String, stateFile: String) {
    readyURL = URL(fileURLWithPath: readyFile)
    stateURL = URL(fileURLWithPath: stateFile)
    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    installMainMenu()

    guard let screen = NSScreen.main else {
      fail("macOS did not expose a primary screen")
    }

    let windowSize = NSSize(width: 640, height: 500)
    let origin = NSPoint(
      x: screen.visibleFrame.midX - windowSize.width / 2,
      y: screen.visibleFrame.midY - windowSize.height / 2
    )
    window = NSWindow(
      contentRect: NSRect(origin: origin, size: windowSize),
      styleMask: [.titled, .closable, .miniaturizable],
      backing: .buffered,
      defer: false,
      screen: screen
    )
    window.title = "Midscene macOS Desktop Smoke"
    window.isReleasedWhenClosed = false

    button = SmokeButton(title: "Midscene Smoke Button", target: self, action: #selector(buttonClicked))
    button.frame = NSRect(x: 190, y: 370, width: 260, height: 72)
    button.isBordered = false
    button.wantsLayer = true
    button.layer?.backgroundColor = NSColor.systemGreen.cgColor
    button.layer?.cornerRadius = 6
    button.contentTintColor = .black
    window.contentView?.addSubview(button)
    button.onMouseDown = { [weak self] in
      guard let self else { return }
      self.clickCount += 1
      self.writeState()
    }

    textField = NSTextField(frame: NSRect(x: 120, y: 275, width: 400, height: 44))
    textField.placeholderString = "Type smoke text"
    textField.delegate = self
    textField.target = self
    textField.action = #selector(textCommitted)
    window.contentView?.addSubview(textField)

    scrollView = NSScrollView(frame: NSRect(x: 120, y: 55, width: 400, height: 160))
    scrollView.hasVerticalScroller = true
    scrollView.borderType = .bezelBorder
    let documentView = FlippedDocumentView(frame: NSRect(x: 0, y: 0, width: 380, height: 720))
    for index in 0..<18 {
      let label = NSTextField(labelWithString: "Scrollable smoke row \(index + 1)")
      label.frame = NSRect(x: 20, y: 16 + index * 38, width: 320, height: 24)
      documentView.addSubview(label)
    }
    scrollView.documentView = documentView
    scrollView.contentView.postsBoundsChangedNotifications = true
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(scrollBoundsChanged),
      name: NSView.boundsDidChangeNotification,
      object: scrollView.contentView
    )
    window.contentView?.addSubview(scrollView)

    activateFixture()
    window.makeFirstResponder(textField)
    writeState()

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
      self?.writeReadyMetadata()
    }
    activationTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) {
      [weak self] _ in
      Task { @MainActor in self?.activateFixture() }
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  func controlTextDidChange(_ obj: Notification) {
    writeState()
  }

  @objc private func buttonClicked() {
    buttonActionCount += 1
    writeState()
  }

  @objc private func textCommitted() {
    lastKey = "Enter"
    writeState()
  }

  @objc private func scrollBoundsChanged() {
    wheelEventCount += 1
    writeState()
  }

  private func activateFixture() {
    window.makeKeyAndOrderFront(nil)
    NSApplication.shared.activate(ignoringOtherApps: true)
    NSRunningApplication.current.activate(options: [.activateAllWindows])
  }

  private func installMainMenu() {
    let mainMenu = NSMenu()

    let applicationMenuItem = NSMenuItem()
    mainMenu.addItem(applicationMenuItem)
    let applicationMenu = NSMenu()
    applicationMenuItem.submenu = applicationMenu
    applicationMenu.addItem(
      withTitle: "Quit Midscene Desktop Smoke Fixture",
      action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: "q"
    )

    let editMenuItem = NSMenuItem()
    mainMenu.addItem(editMenuItem)
    let editMenu = NSMenu(title: "Edit")
    editMenuItem.submenu = editMenu
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(NSMenuItem.separator())
    editMenu.addItem(
      withTitle: "Select All",
      action: #selector(NSText.selectAll(_:)),
      keyEquivalent: "a"
    )

    NSApplication.shared.mainMenu = mainMenu
  }

  private func topLeftBounds(of view: NSView, on screen: NSScreen) -> [String: CGFloat] {
    let windowRect = view.convert(view.bounds, to: nil)
    let screenRect = window.convertToScreen(windowRect)
    return [
      "left": screenRect.minX - screen.frame.minX,
      "top": screen.frame.maxY - screenRect.maxY,
      "width": screenRect.width,
      "height": screenRect.height,
    ]
  }

  private func windowBounds(on screen: NSScreen) -> [String: CGFloat] {
    let frame = window.frame
    return [
      "left": frame.minX - screen.frame.minX,
      "top": screen.frame.maxY - frame.maxY,
      "width": frame.width,
      "height": frame.height,
    ]
  }

  private func writeReadyMetadata() {
    guard let screen = window.screen ?? NSScreen.main else {
      fail("fixture window is not attached to a screen")
    }
    writeJSON(
      [
        "processId": ProcessInfo.processInfo.processIdentifier,
        "visible": window.isVisible,
        "backingScaleFactor": window.backingScaleFactor,
        "screen": [
          "left": 0,
          "top": 0,
          "width": screen.frame.width,
          "height": screen.frame.height,
        ],
        "window": windowBounds(on: screen),
        "button": topLeftBounds(of: button, on: screen),
        "textField": topLeftBounds(of: textField, on: screen),
        "scroll": topLeftBounds(of: scrollView, on: screen),
      ],
      to: readyURL
    )
    print("Midscene macOS desktop smoke fixture ready")
    fflush(stdout)
  }

  private func writeState() {
    guard window != nil, textField != nil, scrollView != nil else {
      return
    }
    writeJSON(
      [
        "visible": window.isVisible,
        "clickCount": clickCount,
        "buttonActionCount": buttonActionCount,
        "text": textField.stringValue,
        "lastKey": lastKey,
        "wheelEventCount": wheelEventCount,
        "scrollValue": scrollView.contentView.bounds.origin.y,
      ],
      to: stateURL
    )
  }

  private func writeJSON(_ value: [String: Any], to url: URL) {
    do {
      let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted])
      try data.write(to: url, options: [.atomic])
    } catch {
      fail("Failed to write fixture JSON: \(error)")
    }
  }

  private func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
    exit(3)
  }
}

@main
@MainActor
struct MacOSDesktopSmokeFixture {
  static func main() {
    guard CommandLine.arguments.count == 3 else {
      FileHandle.standardError.write(
        Data("Usage: macos-desktop-smoke-app <ready-file> <state-file>\n".utf8)
      )
      exit(2)
    }

    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    let controller = FixtureController(
      readyFile: CommandLine.arguments[1],
      stateFile: CommandLine.arguments[2]
    )
    app.delegate = controller
    app.run()
    withExtendedLifetime(controller) {}
  }
}
