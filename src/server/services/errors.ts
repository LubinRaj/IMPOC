import { ZodError } from "zod";
export class AppError extends Error {constructor(public code:string,message:string,public status=400,public details?:unknown){super(message)}}
export function errorResponse(error:unknown):Response {
 if(error instanceof AppError)return Response.json({error:{code:error.code,message:error.message,details:error.details}},{status:error.status});
 if(error instanceof ZodError)return Response.json({error:{code:"INVALID_INPUT",message:"Invalid input",details:error.flatten()}},{status:400});
 if(typeof error==="object"&&error&&"code" in error&&error.code==="23505")return Response.json({error:{code:"DUPLICATE_ID",message:"This resource ID already exists in the scope."}},{status:409});
 console.error(error);return Response.json({error:{code:"INTERNAL_ERROR",message:"The request could not be completed."}},{status:500});
}
export async function jsonBody(req:Request):Promise<unknown>{try{return await req.json()}catch{throw new AppError("INVALID_JSON","A JSON request body is required.")}}
