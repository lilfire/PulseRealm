using System;
using Avalonia.Controls;
using Avalonia.Threading;
using PulseRealm.DesktopTest.ViewModels;

namespace PulseRealm.DesktopTest.Views;

public partial class ControlsWindow : Window
{
    public ControlsWindow()
    {
        InitializeComponent();

        Loaded += (_, _) =>
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
                        catch (Exception ex)
                        {
                            if (DataContext is MainViewModel vm2)
                                vm2.AddLog($"Auto-scroll failed: {ex.Message}", "warn");
                        }
                    }, DispatcherPriority.Background);
                };
            }
        };
    }
}
