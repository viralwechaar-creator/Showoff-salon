'use strict';
// Starting content. Everything here can be edited later from /admin.
// Menu transcribed from "SHOWOFF_SALON treatment menu" PDF (volumes 1.1 to 7.1).

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// [name, description, price, price2, popular]
const cat = (name, gender, items, opts = {}) => ({
  id: 'c-' + slug(name + '-' + gender),
  name, gender,
  note: opts.note || '',
  priceLabels: opts.priceLabels || [],
  items: items.map(([n, d, p, p2, pop]) => ({
    id: 'i-' + slug(name + '-' + gender + '-' + n),
    name: n, desc: d, price: p, price2: p2 == null ? null : p2, popular: !!pop, active: true
  }))
});

function makeSeed() {
  const menu = [
    cat('Luxury facial', 'all', [
      ['Hydra', 'Deep hydration facial that cleanses, exfoliates, and infuses skin with moisture for a glowing finish.', 4000],
      ['Save The Date', 'Bridal-prep facial designed to give instant radiance and smooth, flawless skin for special occasions.', 3500],
      ['Fustu Kanpeki', 'Advanced brightening facial that targets dullness and improves overall skin clarity and texture.', 3300],
      ['Korean Glass', 'Glass-skin facial for ultra-smooth, dewy, and luminous skin inspired by Korean skincare.', 3000],
      ['Jeannot', 'Skin-rejuvenating facial that improves tone, texture, and natural glow.', 3000],
      ['U Tenfinity', 'Firming facial that lifts, tightens, and enhances skin elasticity.', 2800]
    ]),
    cat('Facial', 'all', [
      ['O3 +', 'Oxygenating facial that detoxifies skin and boosts instant brightness.', 2500],
      ['Radiant Glow', 'Glow-enhancing facial that refreshes dull skin and adds natural radiance.', 1800],
      ['Vedic Line', 'Herbal-based facial using natural ingredients to nourish and revitalize skin.', 1500]
    ]),
    cat('Clean up', 'all', [
      ['O3 + Cleanup', 'Deep cleansing treatment that removes impurities and refreshes the skin.', 1200],
      ['Anti Tan Kanpeki', 'Tan-removal cleanup that evens skin tone and restores brightness.', 1000, null, true],
      ['Lotus', 'Gentle cleanup that hydrates and soothes the skin.', 800],
      ['Raaga', 'Basic cleanup that refreshes and lightly cleanses the skin.', 700],
      ['Fresh Glow', 'Quick cleanup for instant freshness and a subtle glow.', 550]
    ]),
    cat('Beauty', 'female', [
      ['Full Face Wax', 'Removes unwanted hair from the entire face for smooth and clean skin.', 400, null, true],
      ['Side Locks Wax', 'Eliminates hair from sideburns to give a neat and defined look.', 150],
      ['Forehead Wax', 'Cleans excess hair from the forehead for a smooth finish.', 50],
      ['Upper Lips Wax', 'Removes fine hair from the upper lip area for a clean appearance.', 40],
      ['Chin Wax', 'Clears unwanted hair from the chin area for smoother skin.', 40],
      ['Eyebrows Threading', 'Shapes and defines eyebrows using precise threading technique.', 50],
      ['Forehead Threading', 'Removes fine hair from the forehead for a polished look.', 30],
      ['Upper Lips Threading', 'Gently removes upper lip hair using threading for smooth results.', 20],
      ['Chin Threading', 'Targets and removes hair from the chin area with precision.', 20]
    ]),
    cat('Hair colour', 'female', [
      ['Highlight', 'Adds lighter strands to enhance dimension and give a stylish, modern look.', 4500],
      ['Ammonia-Free Global Hair Colour', 'Full hair coloring using gentle, ammonia-free formula for smooth and shiny results.', 3000],
      ['Global Hair Colour', 'Even coloring applied to entire hair for a complete refreshed look.', 2500, null, true],
      ['Ammonia-Free Root Touchup', 'Covers regrowth using a gentle formula to match your existing hair color.', 1000],
      ['Root Touchup', 'Covers visible roots to maintain a neat and consistent hair color.', 800, null, true]
    ]),
    cat('Hair treatment', 'female', [
      ['Nanoplastia', 'Deep repair treatment for smooth, frizz-free, glossy hair.', 5500],
      ['Smoothing', 'Makes hair soft, straight, and easy to manage.', 4000],
      ['Botox', 'Repairs damage and restores shine and softness.', 4000, null, true],
      ['Keratin', 'Reduces frizz and adds smoothness and shine.', 3000]
    ]),
    cat('Hair spa', 'female', [
      ['Nourishment hair spa', 'Deep conditioning spa that nourishes dry hair and restores softness.', 1200],
      ['Scalp treatment (hair fall)', 'Targeted scalp care that helps reduce hair fall and keeps the scalp healthy.', 1500],
      ['Ritual hair spa', 'A relaxing spa ritual with massage for soft, shiny, refreshed hair.', 2000],
      ['Plex treatment', 'Bond-repair treatment that strengthens damaged, over-processed hair.', 3000]
    ]),
    cat('Body waxing', 'female', [
      ['Hand waxing', 'Removes hair from entire arms for smooth, even skin.', 200, 350, true],
      ['Half-leg waxing', 'Removes hair from lower or upper legs for a clean finish.', 150, 350],
      ['Full-leg waxing', 'Removes hair from entire legs for silky smooth skin.', 400, 650, true],
      ['Under arms waxing', 'Removes hair from underarms for smooth and hygienic skin.', 100, 150],
      ['Tummy waxing', 'Removes unwanted hair from the stomach area for a clean finish.', 250, 300],
      ['Back waxing full', 'Clears hair from the back for smooth and even skin.', 350, 500],
      ['Chest waxing', 'Removes hair from the chest area for a neat appearance.', 200, 300],
      ['Bikini waxing (peel off)', 'Removes hair around the bikini line for a clean look.', 2000, 1200],
      ['Full body waxing', 'Complete hair removal for overall smooth and polished skin.', 1500, 2500, true]
    ], { priceLabels: ['Normal', 'Rica'] }),
    cat('Beauty', 'male', [
      ['Forehead Wax', 'Clears excess hair from the forehead for a neat appearance.', 100, null, true],
      ['Cheek Wax', 'Removes unwanted hair from cheeks for a clean, defined look.', 200],
      ['Neck Wax', 'Removes hair from the neck area for a sharp and groomed finish.', 200]
    ]),
    cat('Hair colour', 'male', [
      ['Highlight', 'Adds subtle streaks to enhance style and give a modern look.', 1500],
      ['Ammonia-Free Global Hair Colour', 'Full hair coloring using gentle, ammonia-free formula for smooth and shiny results.', 800],
      ['Hair Colour', 'Full hair colouring with a gentle formula for smooth, natural results.', 500, null, true],
      ['Beard colour', 'Colours beard hair for a fuller and well-defined look.', 300]
    ]),
    cat('Body waxing', 'male', [
      ['Hand waxing', 'Removes hair from entire arms for smooth, even skin.', 600, null, true],
      ['Half-leg waxing', 'Removes hair from lower or upper legs for a clean finish.', 500],
      ['Full-leg waxing', 'Removes hair from entire legs for silky smooth skin.', 1000, null, true],
      ['Chest waxing', 'Removes hair from the chest area for a neat appearance.', 500],
      ['Full body waxing', 'Complete hair removal for overall smooth and polished skin.', 2500, null, true]
    ], { note: 'Rica wax' }),
    cat('Pedicure', 'all', [
      ['Herbal Luxury Pedicure', 'Premium herbal treatment that deeply nourishes, relaxes, and rejuvenates tired feet.', 1800],
      ['Alege Pedicure', 'Detoxifying pedicure enriched with algae extracts to cleanse and revitalize skin.', 1500],
      ['Bombini Ice Cream Pedicure', 'Indulgent pedicure with creamy textures for intense hydration and smoothness.', 1200, null, true],
      ['Crystal Pedicure', 'Brightening pedicure that adds shine and softness to dull feet.', 800],
      ['Fresh Feet Pedicure', 'Basic pedicure for quick cleaning, grooming, and fresh-looking feet.', 550, null, true]
    ]),
    cat('Manicure', 'all', [
      ['Herbal Luxury manicure', 'Deep nourishing manicure that hydrates and restores softness to hands.', 1000, null, true],
      ['Alege manicure', 'Detox manicure using algae-based products to refresh and rejuvenate skin.', 900],
      ['Bombini Ice Cream manicure', 'Rich and creamy manicure for intense moisture and smooth hands.', 700],
      ['Crystal manicure', 'Brightening manicure that enhances glow and smoothness.', 500],
      ['Fresh Hands manicure', 'Basic manicure for clean, neat, and well-groomed hands.', 400, null, true]
    ])
  ];

  const ph = (role, bio) => ({ id: 'st-' + slug(role), name: 'Add name', role, bio, photo: '', visible: true });

  return {
    settings: {
      salonName: 'Showoff Salon',
      tagline: 'Unisex salon, Sardarpura, Jodhpur',
      phone: '',
      whatsapp: '',
      email: '',
      address: 'Sardarpura, Jodhpur',
      mapUrl: '',
      instagram: 'showoff_unisex_salon_academy',
      timezone: 'Asia/Kolkata',
      open: '10:00',
      close: '20:00',
      slotMinutes: 30,
      capacity: 2,
      closedDays: [],
      advanceDays: 60,
      invoiceFooter: 'Thank you for visiting Showoff Salon.',
      heroLogo: ''
    },
    content: {
      heroTitle: 'Hair, skin and nails, taken seriously.',
      heroText: 'Facials, hair colour and treatments, waxing, manicure and pedicure, with clear descriptions and fixed prices.',
      servicesText: 'Everything we offer, grouped the way you would ask for it. Choose a group to see its full menu.',
      menuText: 'Swipe or use the arrows to move through the menu. Prices are in rupees.',
      galleryText: 'A look at the salon and our work.',
      stylistsText: 'The people who will look after you.',
      aboutTitle: 'A salon for the whole family.',
      aboutText: 'Every treatment on our menu has a plain description and a fixed price, so you know what to expect before you sit down.\nWe keep the studio calm and unhurried, whether you are in for a quick trim or a full spa afternoon.\nBook online in a minute, or call ahead if you would rather speak to someone first.',
      bookText: 'Choose your services, a date and a time. We will confirm your slot after you send the request.'
    },
    menu,
    stylists: [
      ph('Senior hair stylist', 'Add a short introduction from the admin console.'),
      ph('Skin and facial specialist', 'Add a short introduction from the admin console.'),
      ph('Nail and beauty artist', 'Add a short introduction from the admin console.')
    ],
    gallery: [],
    bookings: [],
    invoices: [],
    expenses: [],
    counters: { booking: 0, invoice: 0 }
  };
}

module.exports = { makeSeed };
