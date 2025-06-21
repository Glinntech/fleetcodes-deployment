import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mongodbatlas from "@pulumi/mongodbatlas";

export function whitelistIps(projectId: string, asgName: pulumi.Output<string>): pulumi.Output<mongodbatlas.ProjectIpAccessList[]> {
    const name =  asgName.apply(name=>name);
    const publicIps =  getInstancePublicIps(name);
    const result = publicIps.apply((ips) => {
        return ips.map((ip, index) => new mongodbatlas.ProjectIpAccessList(
            `access-list-FleetMgmtPreview-${index}`,
            {
                projectId: projectId,
                ipAddress: ip,
                comment: "IP address for ASG instance",
            },
        ));
    });
    return result;
}

// Function to get public IP addresses of instances in an ASG
function getInstancePublicIps(asgName: pulumi.Output<string>): pulumi.Output<string[]> {
  return asgName.apply(async (name) => {
    try {
        const asg = await aws.autoscaling.getGroup({ name });
        if (!asg) {
            return [];
        }
        const instances = await aws.ec2.getInstances({
            instanceTags: {
                "aws:autoscaling:groupName": asg.name,
            },
        });
        pulumi.log.info(`Found ${instances.publicIps.length} public IPs for ASG ${asg.name}`);
        return instances.publicIps;
    } catch (error) {
        pulumi.log.error(
            `Error fetching instance public IPs: most likely a dry run`,
        );
        return [];
    }
  });
}
