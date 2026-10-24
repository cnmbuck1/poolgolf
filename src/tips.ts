// Tips and tricks for each hole: what usually works and what to stay away from. Shown on request from the
// lightbulb button during play (keyed by course id and hole name, so reordering holes doesn't break them).
/** `spin`: when spin helps on this hole, how. */
export interface Tips { do: string[]; avoid: string[]; spin?: string }

const T: Record<string, Record<string, Tips>> = {
  halloween: {
    'Pumpkin Patch': {
      do: ['Thread the gap between the pumpkins: the middle one sits a little behind the first pair.', 'A bank off the top or bottom rail goes round the whole patch.'],
      avoid: ['The jack-o\'-lanterns are bumpers: hit one hard and the ball flies off sideways.', 'The bat circling the cup can knock a slow putt away: wait until it\'s on the far side.'],
      spin: 'Side spin curves the ball round the last pumpkin toward the cup.',
    },
    'Graveyard Shift': {
      do: ['Watch the ghosts: when one fades to a faint shimmer, roll straight through where it is.', 'Aim between the gravestone rows; there\'s a clear lane up the middle.'],
      avoid: ['A ghost you can see is solid and stops the ball dead.', 'Gravestones bounce the ball back hard.'],
    },
    "Witch's Flight": {
      do: ["Roll onto the witch's glowing purple circle: she flies the ball up onto the hill by the cup.", 'Missed the broom? Take the stairs at the far right, the long way round.'],
      avoid: ['The hill\'s edge is a wall from below: you can\'t roll straight up it.', 'Don\'t roll past the circle into the slime (+1 stroke).'],
    },
    'Cauldron Bubble': {
      do: ['Cross the cauldron on the plank, and time it so the ghost has faded or is at the far end.', 'A gentle shot is enough: the plank is long but straight.'],
      avoid: ['Off the plank is green slime (+1 stroke).', 'The cobwebs above and below the cauldron grab the ball and slow it right down.'],
    },
    'Bat Cave': {
      do: ['Shortcut: roll down to the witch at the bottom left; she flies you past two bends.', 'Otherwise zig-zag: down round the first wall, up round the second.'],
      avoid: ['Bats bounce the ball off at speed: wait for a gap in their circle.'],
      spin: 'Side spin helps the ball hook round the end of each wall.',
    },
    'Haunted Mansion': {
      do: ["Ride the witch's broom from the left onto the porch, then take the stairs up to the attic and the cup.", 'Time the stairs for when the ghost on the porch has faded.'],
      avoid: ['The porch and attic edges are walls from below.', 'The bat circles right round the cup: putt when it\'s on the far side.'],
    },
  },
  candy: {
    'Sugar Rush': {
      do: ['Roll straight off the open front edge of the cake: the drop keeps most of your speed.', 'Bank off the top rail to go round the chocolate pond and come down to the cup.'],
      avoid: ['A firm shot straight down the middle runs right into the chocolate pond.'],
      spin: 'Side spin curves the ball round the chocolate pond instead of banking.',
    },
    'Candy Cane Ladder': {
      do: ['Roll onto the glowing ring at the ladder\'s foot. Any speed works; it carries the ball up for you.', 'From the top of the ladder it\'s a short putt along the cake to the cup.'],
      avoid: ['Time your shot so the gingerbread man isn\'t walking across the ladder when you get there.', 'The front of the cake is a wall from below: you can\'t roll up it.'],
    },
    'Chocolate Falls': {
      do: ['Shortcut: roll into the swirl at the top left of the tee layer. The rainbow chute slides you over the river to the far side.', 'Or roll off the front edge and cross the wafer bridge.'],
      avoid: ['Going straight off the bridge at the cup hits the gumdrop in front of it: angle a little.', 'Missing the bridge means chocolate (+1 stroke).'],
      spin: 'Off the bridge, a little side spin curves round the gumdrop in front of the cup.',
    },
    'Gingerbread Lane': {
      do: ['Stop the ball on the striped platform while it\'s down, wait for it to rise, then roll across the cake and off its far side toward the cup.', 'Or go round the cake through the top or bottom lane; a bank off the top rail can reach the cup.'],
      avoid: ['Arriving while the platform is up bounces you off its side.', 'Watch the turnstile in front of the cup.'],
      spin: 'Backspin helps the ball stop on the platform: it bites and pulls back off the cake\'s wall.',
    },
    'Chutes & Ladders': {
      do: ['Climb both ladders: first the one at the bottom left, then the one near the top up to the cup\'s layer.', 'Take the putt gently: par is 5, so there\'s no rush.'],
      avoid: ['Overshooting the cup drops the ball into the chute behind it, all the way back to the start.'],
      spin: 'Backspin on your putts keeps the ball from rolling past the cup into the chute.',
    },
    'Cake Walk': {
      do: ['Straight from the tee into the first ladder, then a short shot up and a little right onto the second ladder\'s ring.', 'The second ladder leaves you a short putt to the cup.'],
      avoid: ['The right (east) sides of both cake layers are open: overhit and you tumble back to the ground.', 'Chocolate ponds sit either side of the way to the first ladder.'],
      spin: 'Backspin stops the ball before the open edges on top of the cake.',
    },
  },
  jurassic: {
    'Lava Run': {
      do: ['The basalt bridge is on the line from the tee to the cup.', 'After the bridge, go round the palm or bank off the top rail to reach the cup.'],
      avoid: ['Missing the bridge means lava (+1 stroke).', 'The palm between the bridge and the cup blocks the straight line.'],
      spin: 'Off the bridge, side spin curves round the palm to the cup.',
    },
    'Tumbleweed Flats': {
      do: ['Watch the tumbleweeds for a moment and shoot through a gap.', 'A firm shot crosses their paths quickly.'],
      avoid: ['A slow shot gets knocked off line by a tumbleweed.', 'The bunker grabs the ball near the cup.'],
    },
    'Bronto Crossing': {
      do: ['You can roll right under the brontosaurus\'s belly, between its legs.', 'Or go round either end of its walk.'],
      avoid: ['Its legs are solid: aim between them.', 'Lava pools wait at the ends.'],
      spin: 'Side spin curves round the brontosaurus\'s legs.',
    },
    "Rex's Lair": {
      do: ['Play along the bottom lane to the corner, then up the right side to the green.', 'Wait for the T-rex\'s tail to swing away before you putt past it.'],
      avoid: ['The tail sweeps right across the approach: time it.', 'The volcano by the bottom rail pushes the ball away, and the lava pool sits in the bottom-right corner.'],
      spin: 'Side spin curves round the corner of the dogleg toward the green.',
    },
    'Geyser Mesa': {
      do: ['Shoot through the gap between the volcanoes into the geyser beyond it: it throws the ball up onto the mesa near the cup.', 'Or go round the second volcano to the timber ladder at the bottom.'],
      avoid: ['Volcano slopes push the ball off line: aim through the middle of the gap.', 'The mesa\'s sides are walls from below.'],
    },
    Extinction: {
      do: ['Go round the stegosaurus, then time the tumbleweeds.', 'Cross the lava on the bridge to reach the raised green.'],
      avoid: ['The volcano by the bottom rail pushes the ball off line.', 'Missing the bridge is lava (+1 stroke).'],
      spin: 'Side spin curves round the stegosaurus.',
    },
  },
  space: {
    Moonwalk: {
      do: ['Go round the astronaut: either side is open.', 'Putt gently: craters curl a slow ball.'],
      avoid: ['The astronaut blocks the straight line.', 'Moon-dust bunkers grab the ball.'],
      spin: 'Side spin curves round the astronaut in the middle.',
    },
    'Asteroid Belt': {
      do: ['Watch the asteroids drift, then shoot through a gap.', 'Banking off a side rail can skip the busiest part.'],
      avoid: ['A slow ball gets clipped by a drifting asteroid.'],
    },
    'Crater Hop': {
      do: ['Get round the dogleg first, then stop the ball on the hover pad while it\'s down.', 'Ride the pad up and roll off onto the green when it\'s level.'],
      avoid: ['The green is only reachable by the hover pad; its sides are walls from below.', 'The big crater swallows speed and curls the ball.'],
      spin: 'Backspin helps the ball stop on the hover pad.',
    },
    'Space Walk': {
      do: ['Cross the crack on the metal bridge.', 'Wait for the rocket by the cup to lift off before you putt.'],
      avoid: ['Missing the bridge sends the ball into space (+1 stroke).', 'The landed rocket is solid.'],
      spin: 'Side spin curves round the rocket sitting in front of the cup.',
    },
    'Close Encounters': {
      do: ['Watch for the red warning rings: that\'s where a meteor is about to land.', 'Go round the alien\'s circle, not through it.'],
      avoid: ['Void pockets at the sides cost a stroke.'],
      spin: 'Side spin curves round the alien\'s circle.',
    },
    'Lunar Landing': {
      do: ['Roll into the launch rocket at the top: it flies the ball onto the landing plateau, close to the cup.', 'Or cross the bridge and climb the gantry ladder.'],
      avoid: ['Time the asteroids on the way.', 'The rocket landing by the cup is solid while it sits there.'],
    },
  },
  circus: {
    'Center Ring': {
      do: ['Roll over the trampoline to bounce clean over the wall.', 'Or squeeze round either end of the wall.'],
      avoid: ['Bounce too hard near the edge and you\'re out of the ring (+1 stroke).'],
    },
    'Clown Alley': {
      do: ['Pick the side of the elephant away from the clowns, and time it.'],
      avoid: ['The elephant blocks the middle.', 'The bunker near the cup grabs the ball.'],
      spin: 'Side spin curves round the elephant in the middle.',
    },
    'Human Cannonball': {
      do: ['Roll into the cannon when the barrel points up toward the stage: it fires you onto it near the cup.', 'Land on the floor instead? Climb the ladder up to the stage.'],
      avoid: ['Too early and the cannon fires you out of the ring (+1 stroke).', 'The cup is behind where the ball lands: putt back to it.'],
    },
    'Bounce House': {
      do: ['Use the trampolines to hop the walls, one at a time.', 'A medium-speed roll onto a trampoline lands safely.'],
      avoid: ['A hard bounce near the edge goes out of the ring (+1 stroke).'],
    },
    Carousel: {
      do: ['Wait for a gap in the carousel and roll through.', 'Then go round the dunk tank in front of the cup.'],
      avoid: ['The dunk tank (water) in front of the cup costs a stroke.', 'The elephants block the top and bottom of the carousel.'],
      spin: 'Side spin curves round the dunk tank in front of the cup.',
    },
    'Grand Finale': {
      do: ['The swinging cannon fires the ball toward the green: time the barrel.', 'Trampolines on the sides hop the dunk tank.'],
      avoid: ['The dunk tank in the middle catches anyone rolling the long way.', 'Mistimed cannon shots go out of the ring.'],
    },
  },
  tomb: {
    'Scarab Gate': {
      do: ['The wall is sealed: roll into the teal scarab portal. You come out of the violet one, at the same speed, the way its arrow points.'],
      avoid: ['Too much speed into the portal carries you a long way out the other side.'],
    },
    'Quicksand Flats': {
      do: ['Shoot through the quicksand gaps with pace so you don\'t stop in them.', 'Play it in stages round the S-bend.'],
      avoid: ['Stopping in quicksand swallows the ball (+1 stroke).'],
      spin: 'Topspin keeps the ball rolling through the quicksand.',
    },
    'Hall of Doors': {
      do: ['Wait for each door to sink before you shoot through.', 'Stop on the stone lift while it\'s down, ride it up, then roll onto the altar.'],
      avoid: ['A door rising in front of you bounces the ball back.', 'Arriving at the lift while it\'s up hits its side.'],
      spin: 'Backspin helps the ball stop on the stone lift.',
    },
    "Mummy's Curse": {
      do: ['Watch the mummies and go through as they pass each other.'],
      avoid: ['The quicksand above the cup swallows a ball that stops in it.', 'The columns in the middle block the straight line.'],
      spin: 'Side spin curves round the columns in the middle.',
    },
    Oasis: {
      do: ['The scarab portal takes you over the Nile.', 'Or cross the narrow bridge with a straight, firm shot.'],
      avoid: ['The water costs a stroke.', 'The columns guard the green, and quicksand sits in front of it.'],
      spin: 'Side spin curves round the columns guarding the green.',
    },
    "Pharaoh's Chamber": {
      do: ['Wait for the great door to sink, then climb the stairs or roll into the portal up onto the dais.', 'Time the second door in front of the cup.'],
      avoid: ['Quicksand on both sides of the second door.', 'The mummy patrols the middle.'],
    },
  },
  arctic: {
    Snowfall: {
      do: ['Roll up to the seal: it flips you over everything toward the green.', 'On the ice, hit softer than you think: the ball keeps sliding.'],
      avoid: ['The walls at the top and bottom: go through the middle gap (mind the boulder behind it).', 'Sliding into the bunkers either side of the cup.'],
      spin: 'Backspin stops the ball sooner on the ice.',
    },
    'Penguin Parade': {
      do: ['The igloo tunnel runs straight through the middle: roll in one door and out the other.'],
      avoid: ['Time the penguins: they knock the ball off line.', 'Ice near the tee adds a lot of slide.'],
      spin: 'Side spin curves round a penguin in your way.',
    },
    'Ski Jump': {
      do: ['Hit the ski jump with pace to fly the crevasse.', 'Then ride the ski lift (the ring at its foot) up to the ridge.'],
      avoid: ['Overshooting the cup sends you down the toboggan run, all the way back to the start.', 'A slow jump drops into the icy water.'],
    },
    'Polar Bear Pass': {
      do: ['The seal near the bottom flips you clean over the ice wall.', 'Or find the small gap at the top of the wall.'],
      avoid: ['The polar bears are big and solid.'],
    },
    'Frozen Lake': {
      do: ['Soft shots: the ball slides a long way on the lake.', 'The seal on its floe can flip you toward the green.'],
      avoid: ['The holes in the ice cost a stroke.', 'The rock by the green stops a ball sliding in.'],
      spin: 'Backspin stops the ball sooner on the ice, short of the holes.',
    },
    'Northern Lights': {
      do: ['Roll through the igloo tunnel, or fly the wall off the ski jump.', 'Putt gently on the slippery raised green.'],
      avoid: ['The penguins in front of the igloo.', 'Too hard on the green and you slide right past the cup.'],
      spin: 'Backspin holds the ball on the slippery green.',
    },
  },
};

/** Tips for a hole, or null for holes without any (trick shots have their own rule card). */
export const tipsFor = (course: string, hole: string): Tips | null => T[course]?.[hole] ?? null;
