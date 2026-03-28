import { HGWRequest, acceptArgs } from "com"

export async function main(ns: NS) {
	const req = HGWRequest.from_args(ns.args)

	await acceptArgs(ns, req, () => {
		return ns.grow(req.target, { additionalMsec: req.offset })
	})
}