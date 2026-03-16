using PulseRealm.Server.Models;

namespace PulseRealm.Server.Tests.Models;

public class AdminConfigTests
{
    // -------------------------------------------------------------------------
    // Default scalar values
    // -------------------------------------------------------------------------

    [Fact]
    public void DefaultCompetitionSubMode_IsRace()
    {
        var config = new AdminConfig();

        Assert.Equal("race", config.CompetitionSubMode);
    }

    [Fact]
    public void DefaultCompetitionPlayerFormat_IsIndividual()
    {
        var config = new AdminConfig();

        Assert.Equal("individual", config.CompetitionPlayerFormat);
    }

    [Fact]
    public void DefaultCompetitionTargetDistanceKm_IsFive()
    {
        var config = new AdminConfig();

        Assert.Equal(5.0, config.CompetitionTargetDistanceKm);
    }

    [Fact]
    public void DefaultCompetitionIntervalMinutes_IsThree()
    {
        var config = new AdminConfig();

        Assert.Equal(3, config.CompetitionIntervalMinutes);
    }

    [Fact]
    public void DefaultCompetitionTargetZone_IsThree()
    {
        var config = new AdminConfig();

        Assert.Equal(3, config.CompetitionTargetZone);
    }

    [Fact]
    public void DefaultCompetitionDurationMinutes_IsTwenty()
    {
        var config = new AdminConfig();

        Assert.Equal(20, config.CompetitionDurationMinutes);
    }

    [Fact]
    public void DefaultDungeonDifficulty_IsNormal()
    {
        var config = new AdminConfig();

        Assert.Equal("normal", config.DungeonDifficulty);
    }

    [Fact]
    public void DefaultDungeonTimeframeMinutes_IsThirty()
    {
        var config = new AdminConfig();

        Assert.Equal(30, config.DungeonTimeframeMinutes);
    }

    [Fact]
    public void DefaultValues_AllCorrect()
    {
        var config = new AdminConfig();

        Assert.Equal("race", config.CompetitionSubMode);
        Assert.Equal("individual", config.CompetitionPlayerFormat);
        Assert.Equal(5.0, config.CompetitionTargetDistanceKm);
        Assert.Equal(3, config.CompetitionIntervalMinutes);
        Assert.Equal(3, config.CompetitionTargetZone);
        Assert.Equal(20, config.CompetitionDurationMinutes);
        Assert.Equal("normal", config.DungeonDifficulty);
        Assert.Equal(30, config.DungeonTimeframeMinutes);
    }

    // -------------------------------------------------------------------------
    // DefaultStreetViewLocations
    // -------------------------------------------------------------------------

    [Fact]
    public void DefaultStreetViewLocations_Returns11Items()
    {
        var locations = AdminConfig.DefaultStreetViewLocations();

        Assert.Equal(11, locations.Count);
    }

    [Fact]
    public void DefaultStreetViewLocations_AllHaveNonZeroLatitude()
    {
        var locations = AdminConfig.DefaultStreetViewLocations();

        Assert.All(locations, loc => Assert.NotEqual(0.0, loc.Lat));
    }

    [Fact]
    public void DefaultStreetViewLocations_AllHaveNonZeroLongitude()
    {
        var locations = AdminConfig.DefaultStreetViewLocations();

        Assert.All(locations, loc => Assert.NotEqual(0.0, loc.Lng));
    }

    [Fact]
    public void DefaultStreetViewLocations_AllHaveNonEmptyAddress()
    {
        var locations = AdminConfig.DefaultStreetViewLocations();

        Assert.All(locations, loc => Assert.NotEmpty(loc.Address));
    }

    [Fact]
    public void DefaultStreetViewLocations_EachCallReturnsNewList()
    {
        var list1 = AdminConfig.DefaultStreetViewLocations();
        var list2 = AdminConfig.DefaultStreetViewLocations();

        Assert.NotSame(list1, list2);
    }

    [Fact]
    public void DefaultStreetViewLocations_ContainsOsloEntry()
    {
        var locations = AdminConfig.DefaultStreetViewLocations();

        Assert.Contains(locations, loc => loc.Address.Contains("Oslo"));
    }

    // -------------------------------------------------------------------------
    // DefaultYouTubeVideos
    // -------------------------------------------------------------------------

    [Fact]
    public void DefaultYouTubeVideos_Returns12Items()
    {
        var videos = AdminConfig.DefaultYouTubeVideos();

        Assert.Equal(12, videos.Count);
    }

    [Fact]
    public void DefaultYouTubeVideos_AllHaveNonEmptyVideoId()
    {
        var videos = AdminConfig.DefaultYouTubeVideos();

        Assert.All(videos, vid => Assert.NotEmpty(vid.VideoId));
    }

    [Fact]
    public void DefaultYouTubeVideos_AllHaveNonEmptyUrl()
    {
        var videos = AdminConfig.DefaultYouTubeVideos();

        Assert.All(videos, vid => Assert.NotEmpty(vid.Url));
    }

    [Fact]
    public void DefaultYouTubeVideos_AllHaveNonEmptyTitle()
    {
        var videos = AdminConfig.DefaultYouTubeVideos();

        Assert.All(videos, vid => Assert.NotEmpty(vid.Title));
    }

    [Fact]
    public void DefaultYouTubeVideos_UrlsAreValidYouTubeLinks()
    {
        var videos = AdminConfig.DefaultYouTubeVideos();

        Assert.All(videos, vid =>
            Assert.StartsWith("https://www.youtube.com/watch?v=", vid.Url));
    }

    [Fact]
    public void DefaultYouTubeVideos_VideoIdMatchesUrlParameter()
    {
        var videos = AdminConfig.DefaultYouTubeVideos();

        Assert.All(videos, vid =>
            Assert.Contains(vid.VideoId, vid.Url));
    }

    [Fact]
    public void DefaultYouTubeVideos_EachCallReturnsNewList()
    {
        var list1 = AdminConfig.DefaultYouTubeVideos();
        var list2 = AdminConfig.DefaultYouTubeVideos();

        Assert.NotSame(list1, list2);
    }

    [Fact]
    public void DefaultYouTubeVideos_AllVideoIdsAreDistinct()
    {
        var videos = AdminConfig.DefaultYouTubeVideos();
        var distinctIds = videos.Select(v => v.VideoId).Distinct().Count();

        Assert.Equal(videos.Count, distinctIds);
    }

    // -------------------------------------------------------------------------
    // Instance list properties initialised from defaults
    // -------------------------------------------------------------------------

    [Fact]
    public void NewConfig_StreetViewLocations_Has11Items()
    {
        var config = new AdminConfig();

        Assert.Equal(11, config.StreetViewLocations.Count);
    }

    [Fact]
    public void NewConfig_YouTubeVideos_Has12Items()
    {
        var config = new AdminConfig();

        Assert.Equal(12, config.YouTubeVideos.Count);
    }

    [Fact]
    public void NewConfig_HasDefaultLists()
    {
        var config = new AdminConfig();

        Assert.Equal(11, config.StreetViewLocations.Count);
        Assert.Equal(12, config.YouTubeVideos.Count);
    }

    // -------------------------------------------------------------------------
    // Mutability — properties can be overwritten
    // -------------------------------------------------------------------------

    [Fact]
    public void CompetitionSubMode_CanBeChanged()
    {
        var config = new AdminConfig { CompetitionSubMode = "interval" };

        Assert.Equal("interval", config.CompetitionSubMode);
    }

    [Fact]
    public void DungeonDifficulty_CanBeChanged()
    {
        var config = new AdminConfig { DungeonDifficulty = "hard" };

        Assert.Equal("hard", config.DungeonDifficulty);
    }

    [Fact]
    public void StreetViewLocations_CanBeReplaced()
    {
        var config = new AdminConfig
        {
            StreetViewLocations = new List<StreetViewLocationDto>
            {
                new() { Lat = 1.0, Lng = 2.0, Address = "Test Location" }
            }
        };

        Assert.Single(config.StreetViewLocations);
        Assert.Equal("Test Location", config.StreetViewLocations[0].Address);
    }

    [Fact]
    public void YouTubeVideos_CanBeReplaced()
    {
        var config = new AdminConfig
        {
            YouTubeVideos = new List<YouTubeVideoDto>
            {
                new() { VideoId = "abc123", Url = "https://www.youtube.com/watch?v=abc123", Title = "Test Video" }
            }
        };

        Assert.Single(config.YouTubeVideos);
        Assert.Equal("abc123", config.YouTubeVideos[0].VideoId);
    }
}
