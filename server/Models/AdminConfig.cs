namespace PulseRealm.Server.Models;

public class AdminConfig
{
    // Competition defaults
    public string CompetitionSubMode { get; set; } = "race";
    public string CompetitionPlayerFormat { get; set; } = "individual";
    public double CompetitionTargetDistanceKm { get; set; } = 5.0;
    public int CompetitionIntervalMinutes { get; set; } = 3;
    public int CompetitionTargetZone { get; set; } = 3;
    public int CompetitionDurationMinutes { get; set; } = 20;

    // Dungeon defaults
    public string DungeonDifficulty { get; set; } = "normal";
    public int DungeonTimeframeMinutes { get; set; } = 30;

    // Curated lists
    public List<StreetViewLocationDto> StreetViewLocations { get; set; } = DefaultStreetViewLocations();
    public List<YouTubeVideoDto> YouTubeVideos { get; set; } = DefaultYouTubeVideos();

    public static List<StreetViewLocationDto> DefaultStreetViewLocations() =>
    [
        new() { Lat = 59.9139, Lng = 10.7522, Address = "Karl Johans gate, Oslo, Norway" },
        new() { Lat = 59.4025, Lng = 9.4204, Address = "Narefjell, Norway" },
        new() { Lat = 58.9864, Lng = 6.1904, Address = "Preikestolen, Norway" },
        new() { Lat = 60.1242, Lng = 6.7400, Address = "Trolltunga, Norway" },
        new() { Lat = 59.0343, Lng = 6.5890, Address = "Kjeragbolten, Norway" },
        new() { Lat = 61.4953, Lng = 8.0819, Address = "Besseggen, Jotunheimen, Norway" },
        new() { Lat = 62.4566, Lng = 7.6708, Address = "Romsdalseggen, Norway" },
        new() { Lat = 62.4552, Lng = 7.6703, Address = "Trollstigen, Norway" },
        new() { Lat = 67.9331, Lng = 13.0848, Address = "Reinebringen, Lofoten, Norway" },
        new() { Lat = 63.0176, Lng = 7.3585, Address = "Atlanterhavsveien, Norway" },
        new() { Lat = 59.9619, Lng = 10.7004, Address = "Vettakollen, Oslo, Norway" },
    ];

    public static List<YouTubeVideoDto> DefaultYouTubeVideos() =>
    [
        new() { VideoId = "hld4uaO1MDE", Url = "https://www.youtube.com/watch?v=hld4uaO1MDE", Title = "Walking Tour - Tokyo, Japan" },
        new() { VideoId = "HDMd3ArOWQk", Url = "https://www.youtube.com/watch?v=HDMd3ArOWQk", Title = "Walking Tour - New York City" },
        new() { VideoId = "a2HxLLnOuLk", Url = "https://www.youtube.com/watch?v=a2HxLLnOuLk", Title = "Walking Tour - Paris, France" },
        new() { VideoId = "5FxMHnOEbPU", Url = "https://www.youtube.com/watch?v=5FxMHnOEbPU", Title = "Walking Tour - London, England" },
        new() { VideoId = "LXb3EKWsInQ", Url = "https://www.youtube.com/watch?v=LXb3EKWsInQ", Title = "Snowfall in New York City" },
        new() { VideoId = "wTcNtgA6gHs", Url = "https://www.youtube.com/watch?v=wTcNtgA6gHs", Title = "Walking Tour - Seoul, South Korea" },
        new() { VideoId = "F2fGMsOdLog", Url = "https://www.youtube.com/watch?v=F2fGMsOdLog", Title = "Walking Tour - Rome, Italy" },
        new() { VideoId = "Scxs7L0vhZ4", Url = "https://www.youtube.com/watch?v=Scxs7L0vhZ4", Title = "Walking Tour - Dubai" },
        new() { VideoId = "sz8Lo1NOkks", Url = "https://www.youtube.com/watch?v=sz8Lo1NOkks", Title = "Rainy Night Walk - Osaka, Japan" },
        new() { VideoId = "PdUiCJnRb_4", Url = "https://www.youtube.com/watch?v=PdUiCJnRb_4", Title = "Walking Tour - Barcelona, Spain" },
        new() { VideoId = "qSk4VWboaE4", Url = "https://www.youtube.com/watch?v=qSk4VWboaE4", Title = "Walking Tour - Istanbul, Turkey" },
        new() { VideoId = "F0VKx9G1Mig", Url = "https://www.youtube.com/watch?v=F0VKx9G1Mig", Title = "Walking Tour - Amsterdam, Netherlands" },
    ];
}

public class StreetViewLocationDto
{
    public double Lat { get; set; }
    public double Lng { get; set; }
    public string Address { get; set; } = "";
}

public class YouTubeVideoDto
{
    public string VideoId { get; set; } = "";
    public string Url { get; set; } = "";
    public string Title { get; set; } = "";
}
