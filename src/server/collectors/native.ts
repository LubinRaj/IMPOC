import { z } from "zod";
import { providerSchema, vmInputSchema, type CanonicalVm, type Provider, type VmInput } from "@/lib/contracts";
const common={os:z.string().nullable(),disk:z.number().int().positive().nullable(),ips:z.array(z.union([z.ipv4(),z.ipv6()])),owner:z.string().nullable(),tags:z.record(z.string(),z.string())};
const aws=z.object({InstanceId:z.string().min(1),Name:z.string().min(1),PrivateIpAddresses:common.ips,PlatformDetails:common.os,VCpu:z.number().int().positive().nullable(),MemoryMiB:z.number().int().positive().nullable(),VolumeGiB:common.disk,State:z.object({Name:z.string()}),Placement:z.object({AvailabilityZone:z.string().nullable()}),Tags:common.tags,Owner:common.owner});
const azure=z.object({id:z.string().min(1),name:z.string().min(1),location:z.string().nullable(),hardwareProfile:z.object({vmSize:z.string(),cpu:z.number().int().positive().nullable(),memoryMB:z.number().int().positive().nullable(),diskGB:common.disk}),powerState:z.string(),privateIPs:common.ips,os:common.os,tags:common.tags,owner:common.owner});
const gcp=z.object({id:z.string().min(1),name:z.string().min(1),zone:z.string().nullable(),machineType:z.string(),guestCpus:z.number().int().positive().nullable(),memoryMb:z.number().int().positive().nullable(),disks:z.array(z.object({sizeGb:z.number().int().positive()})),status:z.string(),networkInterfaces:z.array(z.object({networkIP:z.union([z.ipv4(),z.ipv6()])})),labels:common.tags,owner:common.owner,os:common.os});
const vmware=z.object({vm:z.string().min(1),name:z.string().min(1),power_state:z.string(),cpu_count:z.number().int().positive().nullable(),memory_size_MiB:z.number().int().positive().nullable(),disk_capacity_GiB:common.disk,cluster:z.string().nullable(),guest_ips:common.ips,guest_os:common.os,custom_attributes:common.tags,owner:common.owner});
const proxmox=z.object({vmid:z.string().min(1),name:z.string().min(1),node:z.string().nullable(),status:z.string(),cpus:z.number().int().positive().nullable(),maxmem:z.number().int().positive().nullable(),maxdisk:z.number().int().positive().nullable(),ip:common.ips,ostype:common.os,tags:common.tags,owner:common.owner});
export function canonical(vm:CanonicalVm):CanonicalVm {return {...vm,ipAddresses:[...new Set(vm.ipAddresses)].sort(),tags:Object.fromEntries(Object.entries(vm.tags).sort(([a],[b])=>a.localeCompare(b)))};}
export function toNative(provider:Provider,input:VmInput):Record<string,unknown>{
 const v=vmInputSchema.parse(input);const base={owner:v.owner,tags:v.tags};
 switch(provider){
 case "aws":return {InstanceId:v.externalId,Name:v.hostname,PrivateIpAddresses:v.ipAddresses,PlatformDetails:v.operatingSystem,VCpu:v.cpuCores,MemoryMiB:v.memoryMB,VolumeGiB:v.diskGB,State:{Name:v.powerState},Placement:{AvailabilityZone:v.region},Tags:v.tags,Owner:v.owner};
 case "azure":return {id:v.externalId,name:v.hostname,location:v.region,hardwareProfile:{vmSize:"simulated",cpu:v.cpuCores,memoryMB:v.memoryMB,diskGB:v.diskGB},powerState:v.powerState,privateIPs:v.ipAddresses,os:v.operatingSystem,...base};
 case "gcp":return {id:v.externalId,name:v.hostname,zone:v.region,machineType:"simulated",guestCpus:v.cpuCores,memoryMb:v.memoryMB,disks:v.diskGB?[{sizeGb:v.diskGB}]:[],status:v.powerState,networkInterfaces:v.ipAddresses.map(networkIP=>({networkIP})),labels:v.tags,owner:v.owner,os:v.operatingSystem};
 case "vmware":return {vm:v.externalId,name:v.hostname,power_state:v.powerState,cpu_count:v.cpuCores,memory_size_MiB:v.memoryMB,disk_capacity_GiB:v.diskGB,cluster:v.cluster,guest_ips:v.ipAddresses,guest_os:v.operatingSystem,custom_attributes:v.tags,owner:v.owner};
 case "proxmox":return {vmid:v.externalId,name:v.hostname,node:v.cluster,status:v.powerState,cpus:v.cpuCores,maxmem:v.memoryMB===null?null:v.memoryMB*1048576,maxdisk:v.diskGB===null?null:v.diskGB*1073741824,ip:v.ipAddresses,ostype:v.operatingSystem,...base};
 }
}
const power=(value:string):CanonicalVm["powerState"]=>["running","stopped","suspended"].includes(value)?value as CanonicalVm["powerState"]:"unknown";
export function normalize(providerValue:unknown,scopeId:string,payload:unknown):CanonicalVm{
 const provider=providerSchema.parse(providerValue);let data:Omit<CanonicalVm,"provider"|"scopeId">;
 switch(provider){
 case "aws":{const v=aws.parse(payload);data={externalId:v.InstanceId,hostname:v.Name,ipAddresses:v.PrivateIpAddresses,operatingSystem:v.PlatformDetails,cpuCores:v.VCpu,memoryMB:v.MemoryMiB,diskGB:v.VolumeGiB,powerState:power(v.State.Name),region:v.Placement.AvailabilityZone,cluster:null,tags:v.Tags,owner:v.Owner};break;}
 case "azure":{const v=azure.parse(payload);data={externalId:v.id,hostname:v.name,ipAddresses:v.privateIPs,operatingSystem:v.os,cpuCores:v.hardwareProfile.cpu,memoryMB:v.hardwareProfile.memoryMB,diskGB:v.hardwareProfile.diskGB,powerState:power(v.powerState),region:v.location,cluster:null,tags:v.tags,owner:v.owner};break;}
 case "gcp":{const v=gcp.parse(payload);data={externalId:v.id,hostname:v.name,ipAddresses:v.networkInterfaces.map(i=>i.networkIP),operatingSystem:v.os,cpuCores:v.guestCpus,memoryMB:v.memoryMb,diskGB:v.disks[0]?.sizeGb??null,powerState:power(v.status),region:v.zone,cluster:null,tags:v.labels,owner:v.owner};break;}
 case "vmware":{const v=vmware.parse(payload);data={externalId:v.vm,hostname:v.name,ipAddresses:v.guest_ips,operatingSystem:v.guest_os,cpuCores:v.cpu_count,memoryMB:v.memory_size_MiB,diskGB:v.disk_capacity_GiB,powerState:power(v.power_state),region:null,cluster:v.cluster,tags:v.custom_attributes,owner:v.owner};break;}
 case "proxmox":{const v=proxmox.parse(payload);data={externalId:v.vmid,hostname:v.name,ipAddresses:v.ip,operatingSystem:v.ostype,cpuCores:v.cpus,memoryMB:v.maxmem===null?null:v.maxmem/1048576,diskGB:v.maxdisk===null?null:v.maxdisk/1073741824,powerState:power(v.status),region:null,cluster:v.node,tags:v.tags,owner:v.owner};break;}
 }
 return canonical({provider,scopeId,...data});
}
