// Seed the NFT catalog (40 monkeys + traits). Prices are in in-app tokens.
// Idempotent: uses upsert so re-running does not duplicate rows.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Seed = {
  id: string;
  name: string;
  rarity: string;
  price: number;
  background: string;
  fur: string;
  headgear: string;
  prop: string;
};

const monkeys: Seed[] = [
  { id: 'monk-001', name: 'Golden Emperor', rarity: 'Mythic', price: 9500, background: 'Celestial Galaxy', fur: 'Golden Divine', headgear: 'Crown of Kings', prop: 'Staff of Power' },
  { id: 'monk-002', name: 'Crystal Sage', rarity: 'Mythic', price: 8800, background: 'Aurora Borealis', fur: 'Crystal Shimmer', headgear: 'Wisdom Circlet', prop: 'Ancient Scroll' },
  { id: 'monk-003', name: 'Shadow Lord', rarity: 'Mythic', price: 9200, background: 'Void Darkness', fur: 'Shadow Smoke', headgear: 'Dark Crown', prop: 'Soul Blade' },
  { id: 'monk-004', name: 'Phoenix King', rarity: 'Mythic', price: 9800, background: 'Burning Sky', fur: 'Phoenix Flame', headgear: 'Fire Crown', prop: 'Flame Scepter' },
  { id: 'monk-005', name: 'Royal Guard', rarity: 'Legendary', price: 4500, background: 'Royal Palace', fur: 'Silver Armor', headgear: 'Knight Helmet', prop: 'Royal Sword' },
  { id: 'monk-006', name: 'Space Explorer', rarity: 'Legendary', price: 4200, background: 'Deep Space', fur: 'Cosmic Silver', headgear: 'Astronaut Helmet', prop: 'Laser Blaster' },
  { id: 'monk-007', name: 'Pirate Captain', rarity: 'Legendary', price: 3800, background: 'Stormy Seas', fur: 'Weather Beaten', headgear: "Captain's Hat", prop: 'Treasure Map' },
  { id: 'monk-008', name: 'Ninja Master', rarity: 'Legendary', price: 4800, background: 'Moonlit Dojo', fur: 'Shadow Black', headgear: 'Ninja Mask', prop: 'Katana' },
  { id: 'monk-009', name: 'Wizard Sage', rarity: 'Legendary', price: 4000, background: 'Mystic Forest', fur: 'Ethereal Blue', headgear: 'Wizard Hat', prop: 'Magic Wand' },
  { id: 'monk-010', name: 'Cyber Punk', rarity: 'Legendary', price: 4600, background: 'Neon City', fur: 'Cybernetic', headgear: 'VR Headset', prop: 'Data Chip' },
  { id: 'monk-011', name: 'Forest Ranger', rarity: 'Epic', price: 2200, background: 'Ancient Forest', fur: 'Camouflage Green', headgear: 'Ranger Hat', prop: 'Wooden Bow' },
  { id: 'monk-012', name: 'Desert Nomad', rarity: 'Epic', price: 2500, background: 'Sand Dunes', fur: 'Sandy Brown', headgear: 'Turban', prop: 'Curved Dagger' },
  { id: 'monk-013', name: 'Arctic Explorer', rarity: 'Epic', price: 2300, background: 'Frozen Tundra', fur: 'White Frost', headgear: 'Fur Cap', prop: 'Ice Axe' },
  { id: 'monk-014', name: 'Tribal Chief', rarity: 'Epic', price: 2800, background: 'Jungle Village', fur: 'Tribal Paint', headgear: 'Feather Crown', prop: 'Bone Spear' },
  { id: 'monk-015', name: 'Steampunk Engineer', rarity: 'Epic', price: 2400, background: 'Gear Workshop', fur: 'Copper Tinted', headgear: 'Goggles', prop: 'Wrench' },
  { id: 'monk-016', name: 'Viking Warrior', rarity: 'Epic', price: 2700, background: 'Fjord Mountains', fur: 'Battle Scarred', headgear: 'Horned Helmet', prop: 'Battle Axe' },
  { id: 'monk-017', name: 'Samurai Honor', rarity: 'Epic', price: 2600, background: 'Cherry Blossom', fur: 'Honor Bound', headgear: 'Samurai Helm', prop: 'Honor Blade' },
  { id: 'monk-018', name: 'Biker Rebel', rarity: 'Epic', price: 2100, background: 'Highway', fur: 'Leather Jacket', headgear: 'Bandana', prop: 'Chain' },
  { id: 'monk-019', name: 'Rockstar', rarity: 'Epic', price: 2900, background: 'Concert Stage', fur: 'Glitter Silver', headgear: 'Mohawk', prop: 'Electric Guitar' },
  { id: 'monk-020', name: 'Deep Sea Diver', rarity: 'Epic', price: 2000, background: 'Ocean Depths', fur: 'Wetsuit', headgear: 'Diving Helmet', prop: 'Treasure Chest' },
  { id: 'monk-021', name: 'Beach Monkey', rarity: 'Rare', price: 1200, background: 'Tropical Beach', fur: 'Sun Kissed', headgear: 'Straw Hat', prop: 'Coconut' },
  { id: 'monk-022', name: 'City Dweller', rarity: 'Rare', price: 1500, background: 'Urban Skyline', fur: 'Street Style', headgear: 'Baseball Cap', prop: 'Coffee Cup' },
  { id: 'monk-023', name: 'Garden Keeper', rarity: 'Rare', price: 1100, background: 'Flower Garden', fur: 'Moss Green', headgear: 'Sun Hat', prop: 'Watering Can' },
  { id: 'monk-024', name: 'Mountain Climber', rarity: 'Rare', price: 1400, background: 'Rocky Peak', fur: 'Hiking Gear', headgear: 'Climbing Helmet', prop: 'Rope' },
  { id: 'monk-025', name: 'Chef Supreme', rarity: 'Rare', price: 1300, background: 'Kitchen', fur: 'Chef Whites', headgear: 'Chef Hat', prop: 'Spatula' },
  { id: 'monk-026', name: 'Artist Soul', rarity: 'Rare', price: 1600, background: 'Art Studio', fur: 'Paint Splattered', headgear: 'Beret', prop: 'Paint Brush' },
  { id: 'monk-027', name: 'Librarian', rarity: 'Rare', price: 1000, background: 'Ancient Library', fur: 'Scholarly', headgear: 'Reading Glasses', prop: 'Old Book' },
  { id: 'monk-028', name: 'Farmer', rarity: 'Rare', price: 900, background: 'Wheat Field', fur: 'Work Worn', headgear: 'Straw Hat', prop: 'Pitchfork' },
  { id: 'monk-029', name: 'Mechanic', rarity: 'Rare', price: 1700, background: 'Garage', fur: 'Oil Stained', headgear: 'Work Cap', prop: 'Wrench' },
  { id: 'monk-030', name: 'Photographer', rarity: 'Rare', price: 1800, background: 'Photo Studio', fur: 'Professional', headgear: 'None', prop: 'Camera' },
  { id: 'monk-031', name: 'Basic Monkey', rarity: 'Common', price: 500, background: 'Plain Blue', fur: 'Brown', headgear: 'None', prop: 'Banana' },
  { id: 'monk-032', name: 'Simple Sam', rarity: 'Common', price: 300, background: 'Green Grass', fur: 'Light Brown', headgear: 'None', prop: 'Stick' },
  { id: 'monk-033', name: 'Casual Chris', rarity: 'Common', price: 400, background: 'Blue Sky', fur: 'Dark Brown', headgear: 'None', prop: 'Apple' },
  { id: 'monk-034', name: 'Regular Rick', rarity: 'Common', price: 350, background: 'Tree Branch', fur: 'Grey', headgear: 'None', prop: 'Leaf' },
  { id: 'monk-035', name: 'Plain Pete', rarity: 'Common', price: 600, background: 'Forest', fur: 'Tan', headgear: 'None', prop: 'Twig' },
  { id: 'monk-036', name: 'Ordinary Oliver', rarity: 'Common', price: 450, background: 'Sunset', fur: 'Golden Brown', headgear: 'None', prop: 'Pebble' },
  { id: 'monk-037', name: 'Standard Steve', rarity: 'Common', price: 250, background: 'Cloudy', fur: 'Beige', headgear: 'None', prop: 'Acorn' },
  { id: 'monk-038', name: 'Normal Ned', rarity: 'Common', price: 380, background: 'Meadow', fur: 'Cream', headgear: 'None', prop: 'Flower' },
  { id: 'monk-039', name: 'Basic Bob', rarity: 'Common', price: 550, background: 'Rocks', fur: 'Chestnut', headgear: 'None', prop: 'Stone' },
  { id: 'monk-040', name: 'Common Carl', rarity: 'Common', price: 320, background: 'Dirt Path', fur: 'Rust Brown', headgear: 'None', prop: 'Mud Ball' },
];

async function main() {
  for (const m of monkeys) {
    await prisma.nft.upsert({
      where: { id: m.id },
      update: { name: m.name, rarity: m.rarity, price: m.price, imageUrl: `assets/${m.id}.png` },
      create: { id: m.id, name: m.name, rarity: m.rarity, price: m.price, imageUrl: `assets/${m.id}.png` },
    });
    await prisma.nftTrait.upsert({
      where: { nftId: m.id },
      update: { background: m.background, fur: m.fur, headgear: m.headgear, prop: m.prop },
      create: { nftId: m.id, background: m.background, fur: m.fur, headgear: m.headgear, prop: m.prop },
    });
  }
  console.log(`Seeded ${monkeys.length} NFTs with traits.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
