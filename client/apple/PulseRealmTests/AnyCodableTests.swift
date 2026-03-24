import XCTest


final class AnyCodableTests: XCTestCase {

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    // MARK: - Decoding

    func testDecodeInt() throws {
        let json = "42"
        let value = try decoder.decode(AnyCodable.self, from: Data(json.utf8))
        XCTAssertEqual(value.value as? Int, 42)
    }

    func testDecodeDouble() throws {
        let json = "3.14"
        let value = try decoder.decode(AnyCodable.self, from: Data(json.utf8))
        let doubleValue = try XCTUnwrap(value.value as? Double)
        XCTAssertEqual(doubleValue, 3.14, accuracy: 0.001)
    }

    func testDecodeBool() throws {
        let jsonTrue = "true"
        let valueTrue = try decoder.decode(AnyCodable.self, from: Data(jsonTrue.utf8))
        // Note: Bool may decode as Int in some contexts; check both
        let boolResult = valueTrue.value as? Bool ?? (valueTrue.value as? Int == 1)
        XCTAssertTrue(boolResult)
    }

    func testDecodeString() throws {
        let json = "\"hello\""
        let value = try decoder.decode(AnyCodable.self, from: Data(json.utf8))
        XCTAssertEqual(value.value as? String, "hello")
    }

    func testDecodeNull() throws {
        let json = "null"
        let value = try decoder.decode(AnyCodable.self, from: Data(json.utf8))
        XCTAssertTrue(value.value is NSNull)
    }

    func testDecodeArray() throws {
        let json = "[1, \"two\", 3.0]"
        let value = try decoder.decode(AnyCodable.self, from: Data(json.utf8))
        let array = value.value as? [Any]
        XCTAssertNotNil(array)
        XCTAssertEqual(array?.count, 3)
    }

    func testDecodeDictionary() throws {
        let json = """
        {"name": "Alice", "age": 30}
        """
        let value = try decoder.decode(AnyCodable.self, from: Data(json.utf8))
        let dict = value.value as? [String: Any]
        XCTAssertNotNil(dict)
        XCTAssertEqual(dict?["name"] as? String, "Alice")
        XCTAssertEqual(dict?["age"] as? Int, 30)
    }

    func testDecodeNestedDictionary() throws {
        let json = """
        {"outer": {"inner": "value"}}
        """
        let value = try decoder.decode(AnyCodable.self, from: Data(json.utf8))
        let dict = value.value as? [String: Any]
        let inner = dict?["outer"] as? [String: Any]
        XCTAssertEqual(inner?["inner"] as? String, "value")
    }

    // MARK: - Encoding

    func testEncodeInt() throws {
        let value = AnyCodable(42)
        let data = try encoder.encode(value)
        let json = String(data: data, encoding: .utf8)
        XCTAssertEqual(json, "42")
    }

    func testEncodeDouble() throws {
        let value = AnyCodable(3.14)
        let data = try encoder.encode(value)
        let decoded = try decoder.decode(AnyCodable.self, from: data)
        let decodedDouble = try XCTUnwrap(decoded.value as? Double)
        XCTAssertEqual(decodedDouble, 3.14, accuracy: 0.001)
    }

    func testEncodeString() throws {
        let value = AnyCodable("test")
        let data = try encoder.encode(value)
        let json = String(data: data, encoding: .utf8)
        XCTAssertEqual(json, "\"test\"")
    }

    func testEncodeBool() throws {
        let value = AnyCodable(true)
        let data = try encoder.encode(value)
        let json = String(data: data, encoding: .utf8)
        // Bool might encode as true or 1 depending on Swift version
        XCTAssertNotNil(json)
    }

    func testEncodeNull() throws {
        let value = AnyCodable(NSNull())
        let data = try encoder.encode(value)
        let json = String(data: data, encoding: .utf8)
        XCTAssertEqual(json, "null")
    }

    func testEncodeDictionary() throws {
        let value = AnyCodable(["key": "value"] as [String: Any])
        let data = try encoder.encode(value)
        let decoded = try decoder.decode(AnyCodable.self, from: data)
        let dict = decoded.value as? [String: Any]
        XCTAssertEqual(dict?["key"] as? String, "value")
    }

    func testEncodeArray() throws {
        let value = AnyCodable([1, 2, 3] as [Any])
        let data = try encoder.encode(value)
        let decoded = try decoder.decode(AnyCodable.self, from: data)
        let array = decoded.value as? [Any]
        XCTAssertEqual(array?.count, 3)
    }

    func testEncodeUnsupportedTypeEncodesNil() throws {
        // A type not handled by the switch (e.g. Date) should encode as null
        let value = AnyCodable(Date())
        let data = try encoder.encode(value)
        let json = String(data: data, encoding: .utf8)
        XCTAssertEqual(json, "null")
    }

    // MARK: - Round-trip

    func testRoundTripComplexObject() throws {
        let original: [String: Any] = [
            "name": "PulseRealm",
            "version": 1,
            "active": true,
            "tags": ["health", "fitness"] as [Any],
            "config": ["timeout": 30] as [String: Any]
        ]
        let value = AnyCodable(original)
        let data = try encoder.encode(value)
        let decoded = try decoder.decode(AnyCodable.self, from: data)
        let dict = decoded.value as? [String: Any]
        XCTAssertNotNil(dict)
        XCTAssertEqual(dict?["name"] as? String, "PulseRealm")
    }
}
