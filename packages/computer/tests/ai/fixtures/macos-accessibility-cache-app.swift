import AppKit
import Foundation

@MainActor
final class ClickRecorder: NSObject {
  private let clickedFile: String

  init(clickedFile: String) {
    self.clickedFile = clickedFile
  }

  @objc func recordClick(_ sender: NSButton) {
    sender.title = "Cache Clicked"
    sender.layer?.backgroundColor = NSColor.systemBlue.cgColor

    do {
      let metadata: [String: Any] = [
        "clicked": true,
        "buttonTitle": sender.title,
        "clickedAt": ISO8601DateFormatter().string(from: Date()),
      ]
      let data = try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted])
      try data.write(to: URL(fileURLWithPath: clickedFile), options: [.atomic])
      print("Midscene macOS accessibility cache fixture clicked")
      fflush(stdout)
    } catch {
      FileHandle.standardError.write(Data("Failed to write click metadata: \(error)\n".utf8))
    }
  }
}

@main
@MainActor
struct MacOSAccessibilityCacheFixture {
  static func main() {
    guard CommandLine.arguments.count == 3 else {
      FileHandle.standardError.write(Data("Usage: macos-accessibility-cache-app <ready-file> <clicked-file>\n".utf8))
      exit(2)
    }

    let readyFile = CommandLine.arguments[1]
    let clickedFile = CommandLine.arguments[2]
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    let clickRecorder = ClickRecorder(clickedFile: clickedFile)

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 640, height: 420),
      styleMask: [.titled, .closable, .miniaturizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Midscene macOS Cache Fixture"
    window.center()

    let button = NSButton(
      title: "Midscene Cache Target",
      target: clickRecorder,
      action: #selector(ClickRecorder.recordClick(_:))
    )
    button.frame = NSRect(x: 190, y: 174, width: 260, height: 72)
    button.isBordered = false
    button.wantsLayer = true
    button.layer?.backgroundColor = NSColor.systemGreen.cgColor
    button.layer?.cornerRadius = 4
    button.contentTintColor = .black
    button.setAccessibilityIdentifier("midscene-cache-target")
    button.setAccessibilityLabel("Midscene Cache Target")
    window.contentView?.addSubview(button)

    func activateFixture() {
      window.makeKeyAndOrderFront(nil)
      app.activate(ignoringOtherApps: true)
      NSRunningApplication.current.activate(options: [.activateAllWindows])
    }

    activateFixture()

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
      do {
        let metadata: [String: Any] = [
          "processId": ProcessInfo.processInfo.processIdentifier,
          "visible": window.isVisible,
          "windowTitle": window.title,
          "targetIdentifier": "midscene-cache-target",
          "targetLabel": "Midscene Cache Target",
        ]
        let data = try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted])
        try data.write(to: URL(fileURLWithPath: readyFile), options: [.atomic])
        print("Midscene macOS accessibility cache fixture ready")
        fflush(stdout)
      } catch {
        FileHandle.standardError.write(Data("Failed to write fixture metadata: \(error)\n".utf8))
        exit(3)
      }
    }

    app.run()
  }
}
