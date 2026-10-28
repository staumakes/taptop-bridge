// Cuts the foreground subject (a person, an object) out of a photo onto a transparent PNG,
// on-device with Apple Vision (macOS 14+). Nothing leaves the machine.
// Usage: swift system/scripts/cutout.swift <input image> <output.png> [max side px, default 1600]
// The result is cropped to the subject. Check every cut-out at full size: hair and thin
// edges can carry a halo of the old background.
import AppKit
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: swift cutout.swift <input> <output.png> [max side]\n".data(using: .utf8)!)
  exit(2)
}
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
let maxSide = args.count > 3 ? CGFloat(Double(args[3]) ?? 1600) : 1600

guard let source = CIImage(contentsOf: input, options: [.applyOrientationProperty: true]) else {
  FileHandle.standardError.write("cannot read \(input.path)\n".data(using: .utf8)!)
  exit(1)
}
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: source)
do {
  try handler.perform([request])
  guard let result = request.results?.first, !result.allInstances.isEmpty else {
    FileHandle.standardError.write("no foreground subject found in \(input.lastPathComponent)\n".data(using: .utf8)!)
    exit(1)
  }
  let buffer = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
  var image = CIImage(cvPixelBuffer: buffer)
  let scale = min(1, maxSide / max(image.extent.width, image.extent.height))
  if scale < 1 { image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale)) }
  let context = CIContext()
  guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { exit(1) }
  try context.writePNGRepresentation(of: image, to: output, format: .RGBA8, colorSpace: space)
  print("\(output.path) \(Int(image.extent.width))x\(Int(image.extent.height))")
} catch {
  FileHandle.standardError.write("cutout failed: \(error)\n".data(using: .utf8)!)
  exit(1)
}
