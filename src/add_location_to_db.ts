type RW<T> = { -readonly [R in keyof T]: RW<T[R]> } & {}
function rw<T>(x: T): RW<T> { return x }
function lower<T extends string>(x: T): Lowercase<T> { return x.toLowerCase() as Lowercase<T> }
const SpecialServers = {
	Home: "home",
	FulcrumSecretTechnologies: "fulcrumassets",
	CyberSecServer: "CSEC",
	NiteSecServer: "avmnite-02h",
	TheBlackHandServer: "I.I.I.I",
	BitRunnersServer: "run4theh111z",
	TheDarkArmyServer: ".",
	DaedalusServer: "The-Cave",
	WorldDaemon: "w0r1d_d43m0n",
	DarkWeb: "darkweb",
	NormalLab: "th3_l4byr1nth",
	CruelLab: "cru3l_l4byr1nth",
	MercilessLab: "m3rc1l3ss_l4byr1nth",
	UberLab: "ub3r_l4byr1nth",
	EternalLab: "et3rn4l_l4byr1nth",
	EndlessLab: "end13ss_l4byr1nth",
	FinalLab: "f1n4l_l4byr1nth",
	BonusLab: "b0nus_l4byr1nth",
} as const;
export async function main(ns: NS) {
	const { LocationName } = ns.enums
	const map = rw({
		sector12: rw([
			lower(LocationName.Sector12MegaCorp),
			"blade",
			"4sigma",
			"icarus",
			"univ-energy",
			"deltaone",
			"alpha-ent",
			"rothman-uni",
			"foodnstuff",
			"joesguns",
			"iron-gym",
			"powerhouse-fitness",
		] as const),
		aevum: [
			lower(LocationName.AevumECorp),
			"b-and-a",
			"clarkinc",
			"fulcrumtech",
			"galactic-cyber",
			lower(LocationName.AevumAeroCorp),
			"rho-construction",
			"aevum-police",
			"summit-uni",
			"netlink",
			"crush-fitness",
			"snap-fitness",
		],
		volhaven: [
			lower(LocationName.VolhavenNWO),
			"omnitek",
			"helios",
			"omnia",
			"lexo-corp",
			"zb-institute",
			"syscore",
			lower(LocationName.VolhavenCompuTek),
			"millenium-fitness",
		],
		special: [
			SpecialServers.FulcrumSecretTechnologies,
			SpecialServers.BitRunnersServer,
			SpecialServers.TheBlackHandServer,
			SpecialServers.NiteSecServer,
			SpecialServers.TheDarkArmyServer,
			SpecialServers.CyberSecServer,
			SpecialServers.DaedalusServer,
			SpecialServers.WorldDaemon,
		]
	} as const)
	const serverToOrganizationName = rw({
		megacorp: LocationName.Sector12MegaCorp,
		blade: LocationName.Sector12BladeIndustries,
		"4sigma": LocationName.Sector12FourSigma,
		icarus: LocationName.Sector12IcarusMicrosystems,
		"univ-energy": LocationName.Sector12UniversalEnergy,
		deltaone: LocationName.Sector12DeltaOne,
		"alpha-ent": LocationName.Sector12AlphaEnterprises,
		"rothman-uni": LocationName.Sector12RothmanUniversity,
		foodnstuff: LocationName.Sector12FoodNStuff,
		joesguns: LocationName.Sector12JoesGuns,
		"iron-gym": `${LocationName.Sector12IronGym} Network`,
		"powerhouse-fitness": "Powerhouse Fitness",
		"zb-institute": LocationName.VolhavenZBInstituteOfTechnology,
	} as const)
	ns.tprint("map ", JSON.stringify(map, void 0, 2))
	ns.tprint("serverToOrganizationName ", JSON.stringify(serverToOrganizationName, void 0, 2))
}