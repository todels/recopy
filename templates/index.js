// Template registry. One entry per client; each template is an HTML fragment in that client's folder.
// Editable copy is marked in the fragment with data-field, swappable images with data-image.

export const clients = [
  {
    id: 'burst',
    name: 'Burst',
    css: 'templates/burst/burst.css',
    templates: [
      { id: 'new-trader', name: 'New trader', file: 'templates/burst/new-trader.html', width: 1920, height: 1080 },
      { id: 'weekly-volume', name: 'Weekly volume', file: 'templates/burst/weekly-volume.html', width: 1920, height: 1080 },
      { id: 'backed-trade', name: 'Backed trade', file: 'templates/burst/backed-trade.html', width: 1920, height: 1080 },
    ],
  },
];
