using PulseRealm.Server.Models;

namespace PulseRealm.Server.Utils;

/// <summary>
/// Speed-dependent stride model. Stride length varies with speed — walking uses shorter
/// strides, running uses longer ones. Uses piecewise linear interpolation over biomechanical
/// data points.
/// </summary>
public static class StrideModel
{
    /// <summary>Default stride factor used for uncalibrated users at walking pace (~5 km/h).</summary>
    public const double DefaultWalkingFactor = 0.415;

    /// <summary>
    /// Default (speed, strideFactor) data points based on biomechanical research.
    /// Sorted by speed ascending.
    /// </summary>
    private static readonly (double SpeedKmh, double Factor)[] DefaultCurve =
    {
        (0, 0.35),
        (3, 0.35),
        (5, 0.415),
        (8, 0.55),
        (12, 0.65),
        (15, 0.75),
    };

    /// <summary>
    /// Returns the default stride factor for a given speed using piecewise linear interpolation.
    /// </summary>
    public static double GetStrideFactor(double speedKmh)
    {
        return Interpolate(DefaultCurve, speedKmh);
    }

    /// <summary>
    /// Returns the stride factor for a given speed, using personal calibration data if available,
    /// otherwise falling back to the default curve.
    /// </summary>
    public static double GetStrideFactor(double speedKmh, StrideCalibrationPoint[]? calibration)
    {
        if (calibration is { Length: >= 2 })
        {
            var points = ToSortedCurve(calibration);
            return Interpolate(points, speedKmh);
        }

        return GetStrideFactor(speedKmh);
    }

    /// <summary>
    /// Returns the effective stride factor considering speed, user calibration multiplier,
    /// and personal calibration data.
    /// - If calibration data points exist, interpolates from them.
    /// - Else if userStrideFactor > 0, applies it as a proportional multiplier on the default curve.
    /// - Otherwise uses the default curve directly.
    /// </summary>
    public static double GetEffectiveStrideFactor(double speedKmh, double userStrideFactor, StrideCalibrationPoint[]? calibration)
    {
        if (calibration is { Length: >= 2 })
        {
            var points = ToSortedCurve(calibration);
            return Interpolate(points, speedKmh);
        }

        var baseFactor = GetStrideFactor(speedKmh);

        if (userStrideFactor > 0 && Math.Abs(userStrideFactor - DefaultWalkingFactor) > 0.001)
        {
            return baseFactor * (userStrideFactor / DefaultWalkingFactor);
        }

        return baseFactor;
    }

    /// <summary>
    /// Returns stride length in meters for a given height, speed, and client profile.
    /// </summary>
    public static double GetStrideLength(double heightCm, double speedKmh, ClientProfile? profile)
    {
        var factor = GetEffectiveStrideFactor(
            speedKmh,
            profile?.StrideFactor ?? 0,
            profile?.StrideCalibration);

        return heightCm * factor / 100.0;
    }

    /// <summary>
    /// Converts calibration points to a (SpeedKmh, Factor) array sorted by speed.
    /// Avoids the sort allocation when the array is already in ascending order.
    /// </summary>
    private static (double SpeedKmh, double Factor)[] ToSortedCurve(StrideCalibrationPoint[] calibration)
    {
        // Check whether the array is already sorted to avoid an unnecessary OrderBy allocation
        var alreadySorted = true;
        for (var i = 1; i < calibration.Length; i++)
        {
            if (calibration[i].SpeedKmh < calibration[i - 1].SpeedKmh)
            {
                alreadySorted = false;
                break;
            }
        }

        var source = alreadySorted ? calibration : calibration.OrderBy(p => p.SpeedKmh).ToArray();
        var result = new (double SpeedKmh, double Factor)[source.Length];
        for (var i = 0; i < source.Length; i++)
            result[i] = (source[i].SpeedKmh, source[i].StrideFactor);
        return result;
    }

    /// <summary>
    /// Piecewise linear interpolation over sorted (speed, factor) data points.
    /// Clamps to the first/last value outside the range.
    /// </summary>
    private static double Interpolate((double SpeedKmh, double Factor)[] points, double speedKmh)
    {
        if (points.Length == 0) return DefaultWalkingFactor;
        if (points.Length == 1) return points[0].Factor;

        // Clamp below first point
        if (speedKmh <= points[0].SpeedKmh)
            return points[0].Factor;

        // Clamp above last point
        if (speedKmh >= points[^1].SpeedKmh)
            return points[^1].Factor;

        // Find the segment and interpolate
        for (int i = 0; i < points.Length - 1; i++)
        {
            var (x0, y0) = points[i];
            var (x1, y1) = points[i + 1];

            if (speedKmh >= x0 && speedKmh <= x1)
            {
                if (Math.Abs(x1 - x0) < 0.001) return y0;
                var t = (speedKmh - x0) / (x1 - x0);
                return y0 + t * (y1 - y0);
            }
        }

        return points[^1].Factor;
    }
}
