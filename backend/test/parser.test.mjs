import test from "node:test";
import assert from "node:assert/strict";
import { parsePost } from "../src/parser.mjs";

test("parses a valid launch post",()=>{ const result=parsePost("@otcxlaunch launch\nName: Future Apple\nTicker: FAPL\nPair: AAPLx","otcxlaunch"); assert.equal(result.ok,true); assert.deepEqual(result.value,{name:"Future Apple",ticker:"FAPL",pair:"AAPLx"}); });
test("rejects missing pair",()=>{ const result=parsePost("@otcxlaunch launch\nName: Future Apple\nTicker: FAPL","otcxlaunch"); assert.equal(result.ok,false); assert.match(result.reason,/Pair/); });
