{
  "targets": [
    {
      "target_name": "audio_capture",
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "cflags_cc": ["-std=c++20"],
      "conditions": [
        ['OS=="mac"', {
          "sources": [ "native/audio_capture.mm" ],
          "link_settings": {
            "libraries": [
              "-framework AudioToolbox",
              "-framework CoreAudio",
              "-framework CoreFoundation"
            ]
          },
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++20", "-stdlib=libc++"],
            "OTHER_LDFLAGS": ["-stdlib=libc++"],
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          }
        }],
        ['OS=="linux"', {
          "sources": [ "native/audio_capture_linux.cc" ],
          "cflags_cc": ["-std=c++20"]
        }]
      ]
    }
  ]
}