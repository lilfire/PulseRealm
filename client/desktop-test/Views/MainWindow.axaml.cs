using System.Collections.Specialized;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using PulseRealm.DesktopTest.ViewModels;

namespace PulseRealm.DesktopTest.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();

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

    private void TrackingArea_PointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.OnClick();
        }
    }

    private void TrackingArea_PointerMoved(object? sender, PointerEventArgs e)
    {
        if (DataContext is MainViewModel vm && sender is Visual visual)
        {
            var pos = e.GetPosition(visual);
            vm.OnMouseMove(pos.X, pos.Y);
        }
    }
}
