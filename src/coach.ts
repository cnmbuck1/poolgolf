// First-time help: coach bubbles that walk a new player through their first holes, and a short intro card
// the first time each course is played, naming what's new there.

/** Coach steps, shown one at a time while the ball is at rest; each clears on the next shot. */
export const COACH_STEPS = [
  'Pull back anywhere on the screen to draw the cue: the further back, the harder the shot. Let go to shoot.',
  'While you pull back, drag sideways to aim. The dotted line shows where the ball goes, bounces included.',
  'Try the <b>spin pad</b> (bottom right): drag the red dot left or right to curve the ball around things.',
  'Every hole has three <b>stars</b> to earn (par, birdie, hole in one) and a hidden <b>golden 8-ball</b>: roll through it for coins.',
];

export interface CourseIntro { icon: string; points: string[] }

/** What's new on each course, shown once, the first time it's played. */
export const COURSE_INTROS: Record<string, CourseIntro> = {
  candy: { icon: '🍭', points: [
    'Roll off an open <b>cake edge</b> to drop to the layer below. Edges with an icing rim are solid.',
    'Roll onto a <b>ladder</b>\'s glowing foot to climb up a layer, or into a <b>chute</b>\'s swirl to slide down one. Some chutes send you back to the start!',
    'Chocolate costs a stroke. Striped <b>moving platforms</b> rise and sink: ride one up while it\'s down.',
  ] },
  jurassic: { icon: '🦖', points: [
    '<b>Lava</b> costs a stroke and puts the ball back where you hit it from.',
    '<b>Dinosaurs</b> walk and swing their tails, and tumbleweeds roll across: time your shot.',
    'Volcano slopes roll the ball away. A <b>geyser</b> launches it up to a higher level.',
  ] },
  space: { icon: '🌙', points: [
    'Roll off the edge into <b>space</b> and it\'s +1 stroke.',
    '<b>Craters</b> curve the ball. Asteroids drift, and meteors land where the warning ring flashes.',
    'A <b>launch rocket</b> carries the ball up to a higher level.',
  ] },
  circus: { icon: '🎪', points: [
    '<b>Trampolines</b> bounce the ball over anything in the way: faster in, further out.',
    '<b>Cannons</b> fire the ball across the tent the way the barrel points.',
    'Land outside the ring and it\'s <b>out of bounds</b>: +1 stroke.',
  ] },
  tomb: { icon: '🏺', points: [
    'Roll into a teal <b>scarab portal</b> to come out of its violet partner.',
    '<b>Stone doors</b> rise and sink on a timer: wait for the gap.',
    'Stop in <b>quicksand</b> and it swallows the ball: +1 stroke.',
  ] },
  halloween: { icon: '🎃', points: [
    'Happy Halloween! <b>Haunted Hollow</b> is only open in October.',
    '<b>Ghosts</b> are solid while you can see them and fade away for a moment. <b>Spider webs</b> catch the ball (+1 stroke).',
    "Get around on a <b>witch's broom</b> (roll onto her circle), through the <b>coffins</b>, or launched by a <b>pumpkin catapult</b>.",
  ] },
  pirate: { icon: '🏴‍☠️', points: [
    'Ahoy! <b>Skull Island</b> is the expert course: par is tough, and the sea is never far away.',
    'Cross the <b>planks</b> carefully. <b>Cannonballs</b> land where a red ring flashes, and <b>pirates</b> and <b>parrots</b> get in the way.',
    'On a <b>galleon</b> the deck rocks with the swell, rolling a slow ball one way and then the other: time your putt to the roll.',
  ] },
  christmas: { icon: '🎄', points: [
    'Merry Christmas! <b>North Pole Village</b> is only open from December 1 to January 6.',
    'Roll onto <b>Santa\'s landing pad</b> and his sleigh flies the ball up to the rooftops. Drop down one <b>chimney</b> to pop out of the other.',
    'Ride the <b>toy train</b> from its station. <b>Nutcrackers</b> and <b>snowballs</b> are on the move, and holes in the <b>ice</b> cost a stroke.',
  ] },

  arctic: { icon: '❄️', points: [
    '<b>Ice</b> is slick: the ball glides much further, so hit softer.',
    '<b>Seals</b> flip the ball over obstacles, and <b>ski jumps</b> launch it over walls.',
    'Roll into one <b>igloo</b> door to come out of the other. Holes in the ice cost a stroke.',
  ] },
};
