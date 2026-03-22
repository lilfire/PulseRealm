using PulseRealm.Server.Models;
using PulseRealm.Server.Utils;
using Xunit;

namespace PulseRealm.Server.Tests.Utils;

public class StrideModelTests
{
    // ── Default curve interpolation ─────────────────────────────────────────

    [Theory]
    [InlineData(0, 0.35)]
    [InlineData(1, 0.35)]
    [InlineData(3, 0.35)]
    [InlineData(5, 0.415)]
    [InlineData(8, 0.55)]
    [InlineData(12, 0.65)]
    [InlineData(15, 0.75)]
    public void GetStrideFactor_AtExactDataPoints_ReturnsExpectedValue(double speed, double expected)
    {
        var result = StrideModel.GetStrideFactor(speed);
        Assert.Equal(expected, result, 4);
    }

    [Fact]
    public void GetStrideFactor_BetweenDataPoints_InterpolatesLinearly()
    {
        // Between 5 (0.415) and 8 (0.55), at 6.5 should be midpoint
        var result = StrideModel.GetStrideFactor(6.5);
        var expected = 0.415 + (0.55 - 0.415) * (6.5 - 5) / (8 - 5);
        Assert.Equal(expected, result, 4);
    }

    [Fact]
    public void GetStrideFactor_AboveMaxSpeed_ClampsToLastValue()
    {
        Assert.Equal(0.75, StrideModel.GetStrideFactor(20), 4);
        Assert.Equal(0.75, StrideModel.GetStrideFactor(25), 4);
    }

    [Fact]
    public void GetStrideFactor_NegativeSpeed_ClampsToFirstValue()
    {
        Assert.Equal(0.35, StrideModel.GetStrideFactor(-1), 4);
    }

    // ── Personal calibration ────────────────────────────────────────────────

    [Fact]
    public void GetStrideFactor_WithCalibration_UsesPersonalCurve()
    {
        var calibration = new[]
        {
            new StrideCalibrationPoint { SpeedKmh = 3, StrideFactor = 0.40 },
            new StrideCalibrationPoint { SpeedKmh = 10, StrideFactor = 0.70 },
        };

        // At 3 km/h, should return 0.40
        Assert.Equal(0.40, StrideModel.GetStrideFactor(3, calibration), 4);

        // At 10 km/h, should return 0.70
        Assert.Equal(0.70, StrideModel.GetStrideFactor(10, calibration), 4);

        // At 6.5 km/h, should interpolate
        var expected = 0.40 + (0.70 - 0.40) * (6.5 - 3) / (10 - 3);
        Assert.Equal(expected, StrideModel.GetStrideFactor(6.5, calibration), 4);
    }

    [Fact]
    public void GetStrideFactor_WithSingleCalibrationPoint_FallsBackToDefault()
    {
        var calibration = new[]
        {
            new StrideCalibrationPoint { SpeedKmh = 5, StrideFactor = 0.50 },
        };

        // Only 1 point — not enough, should use default curve
        Assert.Equal(StrideModel.GetStrideFactor(5), StrideModel.GetStrideFactor(5, calibration), 4);
    }

    [Fact]
    public void GetStrideFactor_WithNullCalibration_FallsBackToDefault()
    {
        Assert.Equal(StrideModel.GetStrideFactor(8), StrideModel.GetStrideFactor(8, null), 4);
    }

    // ── User stride factor multiplier ───────────────────────────────────────

    [Fact]
    public void GetEffectiveStrideFactor_WithUserMultiplier_AppliesProportionally()
    {
        // User calibrated at 0.50 (higher than default 0.415)
        // Multiplier = 0.50 / 0.415 = ~1.205
        var result = StrideModel.GetEffectiveStrideFactor(5, 0.50, null);
        var expected = 0.415 * (0.50 / 0.415);
        Assert.Equal(expected, result, 4);
    }

    [Fact]
    public void GetEffectiveStrideFactor_WithDefaultUserFactor_NoMultiplier()
    {
        // User factor is 0.415 (same as default) — no multiplier applied
        var result = StrideModel.GetEffectiveStrideFactor(8, 0.415, null);
        Assert.Equal(StrideModel.GetStrideFactor(8), result, 4);
    }

    [Fact]
    public void GetEffectiveStrideFactor_WithZeroUserFactor_NoMultiplier()
    {
        var result = StrideModel.GetEffectiveStrideFactor(8, 0, null);
        Assert.Equal(StrideModel.GetStrideFactor(8), result, 4);
    }

    [Fact]
    public void GetEffectiveStrideFactor_CalibrationTakesPriorityOverMultiplier()
    {
        var calibration = new[]
        {
            new StrideCalibrationPoint { SpeedKmh = 3, StrideFactor = 0.40 },
            new StrideCalibrationPoint { SpeedKmh = 10, StrideFactor = 0.70 },
        };

        // Even with userStrideFactor set, calibration should be used
        var result = StrideModel.GetEffectiveStrideFactor(3, 0.50, calibration);
        Assert.Equal(0.40, result, 4);
    }

    // ── GetStrideLength ─────────────────────────────────────────────────────

    [Fact]
    public void GetStrideLength_WithNullProfile_UsesDefaultCurve()
    {
        var result = StrideModel.GetStrideLength(170, 5, null);
        var expected = 170 * 0.415 / 100.0;
        Assert.Equal(expected, result, 4);
    }

    [Fact]
    public void GetStrideLength_WithProfile_UsesProfileData()
    {
        var profile = new ClientProfile
        {
            HeightCm = 180,
            StrideFactor = 0.50,
        };

        var result = StrideModel.GetStrideLength(180, 5, profile);
        // Multiplier = 0.50 / 0.415, applied to default curve at 5 km/h (0.415)
        var expected = 180 * 0.50 / 100.0;
        Assert.Equal(expected, result, 4);
    }

    [Fact]
    public void GetStrideLength_AtHighSpeed_StrideIsLonger()
    {
        var slow = StrideModel.GetStrideLength(170, 3, null);
        var fast = StrideModel.GetStrideLength(170, 12, null);
        Assert.True(fast > slow, "Stride at running speed should be longer than walking speed");
    }

    [Fact]
    public void GetStrideLength_WithCalibration_UsesPersonalCurve()
    {
        var profile = new ClientProfile
        {
            HeightCm = 170,
            StrideCalibration = new[]
            {
                new StrideCalibrationPoint { SpeedKmh = 3, StrideFactor = 0.40 },
                new StrideCalibrationPoint { SpeedKmh = 12, StrideFactor = 0.80 },
            },
        };

        var result = StrideModel.GetStrideLength(170, 3, profile);
        var expected = 170 * 0.40 / 100.0;
        Assert.Equal(expected, result, 4);
    }
}
