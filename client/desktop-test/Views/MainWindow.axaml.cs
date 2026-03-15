using System.Collections.Specialized;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using PulseRealm.DesktopTest.ViewModels;

namespace PulseRealm.DesktopTest.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();

        // Tunnel-routed handler fires before any child element can handle/swallow
        // the event, so mouse movement is always captured across the entire window.
        AddHandler(PointerMovedEvent, (_, e) =>
        {
            if (DataContext is MainViewModel vm)
            {
                var pos = e.GetPosition(this);
                vm.OnMouseMove(pos.X, pos.Y);
            }
        }, RoutingStrategies.Tunnel);

        AddHandler(PointerPressedEvent, (_, _) =>
        {
            if (DataContext is MainViewModel vm)
            {
                vm.OnClick();
            }
        }, RoutingStrategies.Tunnel);

        // Start discovery when the window is loaded
        Loaded += async (_, _) =>
        {
            if (DataContext is MainViewModel vm)
            {
                // Auto-scroll log to bottom
                vm.LogEntries.CollectionChanged += (_, _) =>
                {
                    var logList = this.FindControl<ListBox>("LogList");
                    if (logList is not null && logList.ItemCount > 0)
                        logList.ScrollIntoView(logList.Items[logList.ItemCount - 1]!);
                };

                await vm.StartDiscoveryAsync();
            }
        };
    }
}
