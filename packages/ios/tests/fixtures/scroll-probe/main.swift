import UIKit

// Native controls and telemetry only. The host SDK supplies all gestures.
class Controller: UIViewController {
  let scroll = UIScrollView()
  let label = UILabel()
  var mode = "vertical"
  var initial: CGFloat = 0
  var samples = [[String: Double]]()
  var began = Date()
  var timer: Timer?
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .white
    mode = ProcessInfo.processInfo.arguments.last ?? "vertical"
    let w = view.bounds.width
    let h = view.bounds.height
    let horizontal = mode == "horizontal"
    scroll.frame = view.bounds
    scroll.contentInsetAdjustmentBehavior = .never
    scroll.isPagingEnabled = horizontal
    let sw = scroll.bounds.width
    let sh = scroll.bounds.height
    scroll.contentSize =
      horizontal ? CGSize(width: sw * 12, height: sh) : CGSize(width: sw, height: sh * 12)
    view.addSubview(scroll)
    let count = horizontal ? 12 : Int(ceil(sh * 12 / 80))
    for i in 0..<count {
      let cell = UILabel()
      cell.textAlignment = .center
      cell.text = "\(mode) · \(i)"
      cell.font = .systemFont(ofSize: 24)
      cell.backgroundColor =
        i % 2 == 0 ? UIColor(red: 0.85, green: 0.94, blue: 1, alpha: 1) : .white
      cell.frame =
        horizontal
        ? CGRect(x: CGFloat(i) * sw, y: 0, width: sw, height: sh)
        : CGRect(x: 0, y: CGFloat(i) * 80, width: sw, height: 80)
      scroll.addSubview(cell)
    }
    initial =
      horizontal
      ? sw * 4 : (mode == "top" ? 0 : mode == "bottom" ? scroll.contentSize.height - sh : sh * 3)
    scroll.contentOffset = horizontal ? CGPoint(x: initial, y: 0) : CGPoint(x: 0, y: initial)
    label.frame = CGRect(x: 10, y: h - 110, width: w - 20, height: 65)
    label.backgroundColor = .yellow
    label.numberOfLines = 3
    label.font = .monospacedSystemFont(ofSize: 14, weight: .bold)
    label.isUserInteractionEnabled = false
    view.addSubview(label)
    timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
      self?.record()
    }
    RunLoop.main.add(timer!, forMode: .common)
    record()
  }
  func record() {
    let x = scroll.contentOffset.x
    let y = scroll.contentOffset.y
    samples.append([
      "t": Date().timeIntervalSince(began), "x": x, "y": y, "dragging": scroll.isDragging ? 1 : 0,
      "decelerating": scroll.isDecelerating ? 1 : 0,
    ])
    label.text =
      "\(mode) x=\(Int(x)) y=\(Int(y))\ninitial=\(Int(initial)) screen=\(view.bounds.size)"
    let obj: [String: Any] = [
      "mode": mode, "width": view.bounds.width, "height": view.bounds.height, "initial": initial,
      "x": x, "y": y, "samples": samples,
    ]
    do {
      let data = try JSONSerialization.data(withJSONObject: obj)
      let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      try data.write(to: dir.appendingPathComponent("metrics.json"), options: .atomic)
    } catch {
      fatalError("Cannot write scroll fixture measurements: \(error)")
    }
  }
}
class App: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.rootViewController = Controller()
    window?.makeKeyAndVisible()
    return true
  }
}
UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(App.self))
