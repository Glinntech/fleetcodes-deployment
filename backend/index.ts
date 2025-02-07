import * as pulumi from "@pulumi/pulumi";
import {fleetMgmtLB} from "./cluster/lb";
import {image} from "./svcs/fleet-mgmt-deno";
import {fleetMgmtService} from "./svcs/fleet-mgmt-deno";


image.imageUri.apply(image => pulumi.log.info(`${image}`).then(() => console.log("logged image")));

fleetMgmtService.name.apply(name => pulumi.log.info(`${name}`).then(() => console.log("logged service name")));
export const url = pulumi.interpolate`http://${fleetMgmtLB.dnsName}`;

console.log(url);