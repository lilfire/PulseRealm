using System;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Threading;
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

        Loaded += async (_, _) =>
        {
            if (DataContext is MainViewModel vm)
            {
                // Auto-scroll log to bottom
                vm.LogEntries.CollectionChanged += (_, _) =>
                {
                    Dispatcher.UIThread.Post(() =>
                    {
                        try
                        {
                            var logList = this.FindControl<ListBox>("LogList");
                            if (logList is not null && logList.ItemCount > 0)
                                logList.ScrollIntoView(logList.Items[logList.ItemCount - 1]!);
                        }
                        catch { }
                    }, DispatcherPriority.Background);
                };

                await vm.StartDiscoveryAsync();
            }
        };
    }
}
