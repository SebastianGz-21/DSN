const test = require("node:test");
const assert = require("node:assert/strict");
const { matchesImageSignature } = require("./media");

test("media upload accepts valid signatures for supported image formats", () => {
  const samples = [
    ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00])],
    ["image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["image/webp", Buffer.from("RIFF0000WEBP")],
    ["image/gif", Buffer.from("GIF89a")],
  ];

  for (const [mimetype, buffer] of samples) {
    assert.equal(matchesImageSignature({ mimetype, buffer }), true, mimetype);
  }
});

test("media upload rejects unsupported or mismatched file signatures", () => {
  assert.equal(matchesImageSignature({ mimetype: "image/svg+xml", buffer: Buffer.from("<svg>") }), false);
  assert.equal(matchesImageSignature({ mimetype: "image/png", buffer: Buffer.from("not a png") }), false);
});
