
(function () {
  'use strict';

  var COLLECTIONS = ['announcements', 'events', 'team', 'gallery', 'collaborations'];
  function str(v) { return typeof v === 'string' ? v : ''; }
  function list(v) { return Array.isArray(v) ? v : []; }

  function create(baseUrl) {
    var url = String(baseUrl || '').replace(/\/+$/, '');

    function imageUrl(path) {
      if (!path || typeof path !== 'string') return '';
      if (path.indexOf('storage:') === 0) return url + '/storage/v1/object/public/media/' + path.slice(8);
      return path;
    }

    var m = {
      imageUrl: imageUrl,
      announcement: function (a) {
        return { id: str(a.id), title: str(a.title), date: str(a.date), summary: str(a.summary), body: str(a.body), link: str(a.link) };
      },
      // An event's images in display order. Events saved before multi-image support only have `image`; that
      // single image is used so they keep working unchanged.
      eventImages: function (e) {
        var out = [];
        list(e.images).forEach(function (item) {
          var src = imageUrl(item && item.image);
          if (src) out.push({ id: str(item.id), src: src, alt: str(item.alt) });
        });
        if (!out.length && e.image) out.push({ id: '', src: imageUrl(e.image), alt: str(e.image_alt) });
        return out;
      },
      event: function (e) {
        var images = m.eventImages(e);
        return {
          id: str(e.id), title: str(e.title), date: str(e.date), time: str(e.time), location: str(e.location),
          description: str(e.description), category: str(e.category), layout: str(e.layout) || 'event',
          format: str(e.format), platform: str(e.platform), participants: str(e.participants),
          speakers: list(e.speakers), keyPoints: list(e.key_points), winners: list(e.winners),
          sessions: list(e.sessions), competitionSections: list(e.competition_sections), links: list(e.links),
          image: images.length ? images[0].src : imageUrl(e.image), imageAlt: images.length && images[0].alt ? images[0].alt : str(e.image_alt),
          images: images, additionalInfo: str(e.additional_info),
          logo: imageUrl(e.logo),
          brochure: str(e.brochure),
          event_details: e.event_details && typeof e.event_details === 'object' ? e.event_details : {},
          placeholder: e.placeholder === true
        };
      },
      team: function (t) {
        return { name: str(t.name), position: str(t.position), tier: str(t.tier), photo: imageUrl(t.photo) };
      },
      gallery: function (g) {
        return {
          id: str(g.id), title: str(g.title), description: str(g.description), image: imageUrl(g.image), alt: str(g.alt),
          mediaType: g.media_type === 'illustration' ? 'illustration' : 'photo', date: str(g.date_label), location: str(g.location)
        };
      },
      collaboration: function (c) {
        return { name: str(c.name), type: str(c.type), logo: imageUrl(c.logo), url: str(c.url) };
      },
      
      all: function (raw, options) {
        if (!raw || typeof raw !== 'object') return null;
        for (var i = 0; i < COLLECTIONS.length; i++) {
          if (!Array.isArray(raw[COLLECTIONS[i]])) return null;
        }
        var total = 0;
        COLLECTIONS.forEach(function (k) { total += raw[k].length; });
        if (total === 0 && !(options && options.allowEmpty)) return null;
        return {
          announcements: raw.announcements.map(m.announcement),
          events: raw.events.map(m.event),
          team: raw.team.map(m.team),
          gallery: raw.gallery.map(m.gallery),
          collaborations: raw.collaborations.map(m.collaboration)
        };
      }
    };
    return m;
  }

  window.BLITZ_MAP = { create: create, COLLECTIONS: COLLECTIONS };
}());
