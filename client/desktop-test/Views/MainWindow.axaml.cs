using System;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using PulseRealm.DesktopTest.ViewModels;

namespace PulseRealm.DesktopTest.Views;

public partial class MainWindow : Window
{
    private ControlsWindow? _controlsWindow;

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
                // Open the controls window — not owned, so it can be positioned independently
                _controlsWindow = new ControlsWindow
                {
                    DataContext = DataContext,
                };
                _controlsWindow.Show();

                await vm.StartDiscoveryAsync();
            }
        };

        Closing += (_, _) =>
        {
            _controlsWindow?.Close();
        };
    }
}
