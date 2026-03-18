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

    // Protection / rate limiting
    public int MaxWearableMessagesPerSecond { get; set; } = 5;
    public int MaxConcurrentRealms { get; set; } = 20;

    // Curated lists
    public List<StreetViewLocationDto> StreetViewLocations { get; set; } = DefaultStreetViewLocations();
    public List<YouTubeVideoDto> YouTubeVideos { get; set; } = DefaultYouTubeVideos();
    public List<CuratedRouteDto> CuratedRoutes { get; set; } = DefaultCuratedRoutes();

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

    public static List<CuratedRouteDto> DefaultCuratedRoutes() =>
    [
        new() { FromLat = 48.8584, FromLng = 2.2945, FromAddress = "Eiffel Tower, Paris", ToLat = 48.8606, ToLng = 2.3376, ToAddress = "Louvre Museum, Paris" },
        new() { FromLat = 40.7484, FromLng = -73.9857, FromAddress = "Empire State Building, NYC", ToLat = 40.7580, ToLng = -73.9855, ToAddress = "Times Square, NYC" },
        new() { FromLat = 51.5014, FromLng = -0.1419, FromAddress = "Big Ben, London", ToLat = 51.5081, ToLng = -0.0759, ToAddress = "Tower of London" },
        new() { FromLat = 41.8902, FromLng = 12.4922, FromAddress = "Colosseum, Rome", ToLat = 41.9029, ToLng = 12.4534, ToAddress = "Vatican City, Rome" },
        new() { FromLat = 35.6762, FromLng = 139.6503, FromAddress = "Shibuya, Tokyo", ToLat = 35.6586, ToLng = 139.7454, ToAddress = "Tokyo Tower" },
        new() { FromLat = 37.8199, FromLng = -122.4783, FromAddress = "Golden Gate Bridge, SF", ToLat = 37.8083, ToLng = -122.4156, ToAddress = "Fisherman's Wharf, SF" },
        new() { FromLat = 52.5163, FromLng = 13.3777, FromAddress = "Brandenburg Gate, Berlin", ToLat = 52.5209, ToLng = 13.4094, ToAddress = "Alexanderplatz, Berlin" },
        new() { FromLat = 59.9139, FromLng = 10.7522, FromAddress = "Karl Johans gate, Oslo", ToLat = 59.9050, ToLng = 10.7505, ToAddress = "Aker Brygge, Oslo" },
        new() { FromLat = -33.8568, FromLng = 151.2153, FromAddress = "Sydney Opera House", ToLat = -33.8523, ToLng = 151.2108, ToAddress = "Sydney Harbour Bridge" },
        new() { FromLat = 50.0755, FromLng = 14.4378, FromAddress = "Charles Bridge, Prague", ToLat = 50.0865, ToLng = 14.4200, ToAddress = "Prague Castle" },
    ];
}

public class StreetViewLocationDto
{
    public double Lat { get; set; }
    public double Lng { get; set; }
    public string Address { get; set; } = "";
    public double Heading { get; set; } = 0;
    public double Pitch { get; set; } = 0;
}

public class YouTubeVideoDto
{
    public string VideoId { get; set; } = "";
    public string Url { get; set; } = "";
    public string Title { get; set; } = "";
    public double BaseSpeedKmh { get; set; } = 5.0;
}

public class CuratedRouteDto
{
    public double FromLat { get; set; }
    public double FromLng { get; set; }
    public string FromAddress { get; set; } = "";
    public double ToLat { get; set; }
    public double ToLng { get; set; }
    public string ToAddress { get; set; } = "";
}
