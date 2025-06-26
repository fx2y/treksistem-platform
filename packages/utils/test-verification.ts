#!/usr/bin/env tsx
/**
 * @fileoverview Comprehensive Verification Test Script for Spec_010
 * 
 * This script performs comprehensive verification of the secure public identifier
 * implementation with nanoid v5.x, TypeScript branded types, and Cloudflare Workers
 * optimizations to ensure all functional, structural, and performance requirements
 * are met.
 * 
 * ## Test Coverage
 * - ✅ TypeScript branded types functionality
 * - ✅ Prefix validation and error handling
 * - ✅ Format and length verification (nanoid v5.x = 21 chars)
 * - ✅ URL-safe character constraints
 * - ✅ Uniqueness verification (10,000+ generations)
 * - ✅ Performance benchmarks (>1M ops/sec target)
 * - ✅ Cloudflare Workers compatibility tests
 * - ✅ Memory usage and optimization verification
 * 
 * @author Treksistem Platform Team
 */

import { performance } from 'perf_hooks'
import assert from 'assert'

// Import from the main module
import { 
  generatePublicId, 
  isValidPublicId, 
  extractPrefix,
  generateUserId,
  generateOrderId,
  generateProductId,
  generateOrganizationId,
  generateSessionId,
  type UserId, 
  type OrderId,
  type ProductId,
  type OrganizationId,
  type SessionId
} from './src/index.js'

// Import Cloudflare Workers optimizations
import { 
  WorkersIdGenerator,
  generateBatch,
  RequestContext,
  PerformanceMonitor,
  optimizeForWorkers,
  isCloudflareWorkers
} from './src/cloudflare-workers.js'

// =============================================================================
// TEST UTILITIES
// =============================================================================

interface TestResult {
  name: string
  passed: boolean
  duration: number
  error?: string
  metrics?: Record<string, any>
}

class TestRunner {
  private results: TestResult[] = []
  private startTime = 0

  async runTest(name: string, testFn: () => Promise<any> | any): Promise<void> {
    this.startTime = performance.now()
    console.log(`🧪 Running: ${name}`)
    
    try {
      const result = await testFn()
      const duration = performance.now() - this.startTime
      
      this.results.push({
        name,
        passed: true,
        duration,
        metrics: typeof result === 'object' ? result : undefined
      })
      
      console.log(`✅ PASSED: ${name} (${duration.toFixed(2)}ms)`)
      if (result && typeof result === 'object') {
        console.log(`   📊 Metrics:`, result)
      }
    } catch (error) {
      const duration = performance.now() - this.startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      
      this.results.push({
        name,
        passed: false,
        duration,
        error: errorMsg
      })
      
      console.log(`❌ FAILED: ${name} (${duration.toFixed(2)}ms)`)
      console.log(`   💥 Error: ${errorMsg}`)
      throw error // Re-throw to stop execution on failure
    }
  }

  getSummary() {
    const passed = this.results.filter(r => r.passed).length
    const total = this.results.length
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0)
    
    return {
      passed,
      total,
      totalDuration,
      success: passed === total,
      results: this.results
    }
  }
}

// =============================================================================
// CORE FUNCTIONALITY TESTS
// =============================================================================

async function testTypeScriptBrandedTypes() {
  console.log('   🎯 Testing TypeScript branded types...')
  
  const userId = generateUserId()
  const orderId = generateOrderId()
  const productId = generateProductId()
  const orgId = generateOrganizationId()
  const sessionId = generateSessionId()
  
  // Verify types are strings
  assert(typeof userId === 'string', 'User ID should be string')
  assert(typeof orderId === 'string', 'Order ID should be string')
  assert(typeof productId === 'string', 'Product ID should be string')
  assert(typeof orgId === 'string', 'Organization ID should be string')
  assert(typeof sessionId === 'string', 'Session ID should be string')
  
  // Verify correct prefixes
  assert(userId.startsWith('user_'), `User ID should start with 'user_', got: ${userId}`)
  assert(orderId.startsWith('ord_'), `Order ID should start with 'ord_', got: ${orderId}`)
  assert(productId.startsWith('prod_'), `Product ID should start with 'prod_', got: ${productId}`)
  assert(orgId.startsWith('org_'), `Organization ID should start with 'org_', got: ${orgId}`)
  assert(sessionId.startsWith('sess_'), `Session ID should start with 'sess_', got: ${sessionId}`)
  
  // Test custom branded types
  const customUserId = generatePublicId<UserId>('user')
  const customOrderId = generatePublicId<OrderId>('ord')
  
  assert(typeof customUserId === 'string', 'Custom User ID should be string')
  assert(typeof customOrderId === 'string', 'Custom Order ID should be string')
  
  return {
    userId,
    orderId,
    productId,
    orgId,
    sessionId,
    customUserId,
    customOrderId
  }
}

async function testPrefixValidation() {
  console.log('   🔍 Testing prefix validation...')
  
  const validPrefixes = ['ab', 'user', 'ord', 'prod', 'org', 'a1b2c3d4e5']
  const invalidPrefixes = [
    'a',           // Too short
    'a1b2c3d4e5f6', // Too long
    'organization', // Too long (12 chars)
    'User',        // Uppercase
    'user-name',   // Special character
    'user_name',   // Underscore
    'user name',   // Space
    '',            // Empty
    '123',         // Numbers only (valid but edge case)
  ]
  
  // Test valid prefixes
  for (const prefix of validPrefixes) {
    const id = generatePublicId(prefix)
    assert(id.startsWith(`${prefix}_`), `ID should start with '${prefix}_', got: ${id}`)
  }
  
  // Test invalid prefixes
  let errorCount = 0
  for (const prefix of invalidPrefixes) {
    try {
      generatePublicId(prefix)
      if (prefix === '123') {
        // Numbers only is actually valid, just documenting the behavior
        continue
      }
      assert(false, `Should throw for invalid prefix: ${prefix}`)
    } catch (error) {
      errorCount++
      assert(error instanceof Error, 'Should throw Error for invalid prefix')
      assert(error.message.includes('Invalid prefix'), 'Error message should mention invalid prefix')
    }
  }
  
  return {
    validPrefixes: validPrefixes.length,
    invalidPrefixes: errorCount,
    totalTested: validPrefixes.length + invalidPrefixes.length
  }
}

async function testFormatAndLength() {
  console.log('   📏 Testing format and nanoid v5.x length...')
  
  const testIds = [
    generatePublicId('test'),
    generatePublicId('ab'),
    generatePublicId('a1b2c3d4e5')
  ]
  
  for (const id of testIds) {
    const underscoreIndex = id.indexOf('_')
    assert(underscoreIndex !== -1, `ID should contain at least one underscore. Got: ${id}`)
    
    const prefix = id.slice(0, underscoreIndex)
    const nanoidPart = id.slice(underscoreIndex + 1)
    assert(prefix.length >= 2 && prefix.length <= 10, `Prefix should be 2-10 chars. Got: ${prefix}`)
    assert(nanoidPart.length === 21, `nanoid part should be 21 chars. Got: ${nanoidPart.length} chars in ${nanoidPart}`)
    
    // Verify nanoid format (A-Za-z0-9_-)
    const nanoidRegex = /^[A-Za-z0-9_-]{21}$/
    assert(nanoidRegex.test(nanoidPart), `nanoid part should match regex. Got: ${nanoidPart}`)
  }
  
  return {
    idsGenerated: testIds.length,
    averageLength: testIds.reduce((sum, id) => sum + id.length, 0) / testIds.length,
    sampleIds: testIds
  }
}

async function testUrlSafeCharacters() {
  console.log('   🌐 Testing URL-safe characters...')
  
  const urlSafeRegex = /^[A-Za-z0-9_-]+$/
  const testCount = 100
  
  for (let i = 0; i < testCount; i++) {
    const id = generatePublicId('test')
    assert(urlSafeRegex.test(id), `ID contains non-URL-safe characters: ${id}`)
  }
  
  // Test specific characters that should be present
  const allChars = new Set<string>()
  for (let i = 0; i < 1000; i++) {
    const id = generatePublicId('test')
    for (const char of id) {
      allChars.add(char)
    }
  }
  
  // Should only contain URL-safe characters
  const urlSafeChars = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-')
  for (const char of allChars) {
    assert(urlSafeChars.has(char), `Found non-URL-safe character: ${char}`)
  }
  
  return {
    idsGenerated: testCount,
    uniqueCharsFound: allChars.size,
    allUrlSafe: true
  }
}

async function testUniqueness() {
  console.log('   🔄 Testing uniqueness with 10,000 generations...')
  
  const idSet = new Set<string>()
  const testCount = 10000
  const startTime = performance.now()
  
  for (let i = 0; i < testCount; i++) {
    const id = generatePublicId('uniq')
    
    assert(!idSet.has(id), `Found duplicate ID: ${id} (iteration ${i})`)
    idSet.add(id)
  }
  
  const duration = performance.now() - startTime
  const opsPerSec = Math.round(testCount / (duration / 1000))
  
  assert(idSet.size === testCount, `Expected ${testCount} unique IDs, got ${idSet.size}`)
  
  return {
    idsGenerated: testCount,
    uniqueIds: idSet.size,
    duration,
    opsPerSec,
    collisions: 0
  }
}

// =============================================================================
// VALIDATION UTILITIES TESTS
// =============================================================================

async function testValidationUtilities() {
  console.log('   🛠️ Testing validation utilities...')
  
  // Test isValidPublicId
  const validIds = [
    generatePublicId('test'),
    generatePublicId('ab'),
    generatePublicId('a1b2c3d4e5')
  ]
  
  const invalidIds = [
    'test',              // No underscore
    'test_',             // No nanoid part
    'test_short',        // nanoid too short
    'test_toolongnanoidpart123', // nanoid too long
    'TEST_a1b2c3d4e5f6g7h8i9j0k', // uppercase prefix
    'test-invalid_a1b2c3d4e5f6g7h8i9j0k', // special char in prefix
    'test_a1b2c3d4e5f6g7h8i9j0k!', // special char in nanoid
  ]
  
  for (const id of validIds) {
    assert(isValidPublicId(id), `Should be valid: ${id}`)
  }
  
  for (const id of invalidIds) {
    assert(!isValidPublicId(id), `Should be invalid: ${id}`)
  }
  
  // Test extractPrefix
  for (const id of validIds) {
    const prefix = extractPrefix(id)
    assert(id.startsWith(`${prefix}_`), `Extracted prefix should match: ${prefix} from ${id}`)
  }
  
  // Test extractPrefix with invalid IDs
  for (const id of invalidIds) {
    try {
      extractPrefix(id)
      assert(false, `Should throw for invalid ID: ${id}`)
    } catch (error) {
      assert(error instanceof Error, 'Should throw Error for invalid ID')
    }
  }
  
  return {
    validIdsTestedCount: validIds.length,
    invalidIdsTestedCount: invalidIds.length,
    allValidationsPassed: true
  }
}

// =============================================================================
// PERFORMANCE BENCHMARKS
// =============================================================================

async function testPerformanceBenchmarks() {
  console.log('   🚀 Testing performance benchmarks...')
  
  const iterations = 100000
  const targetOpsPerSec = 1000000 // 1M ops/sec
  
  // Test basic generatePublicId performance
  const start = performance.now()
  
  for (let i = 0; i < iterations; i++) {
    generatePublicId('perf')
  }
  
  const end = performance.now()
  const duration = end - start
  const opsPerSec = Math.round(iterations / (duration / 1000))
  
  console.log(`   📊 Performance: ${opsPerSec.toLocaleString()} ops/sec`)
  
  // Assert performance target
  assert(opsPerSec >= targetOpsPerSec, `Performance below threshold: ${opsPerSec} ops/sec (target: ${targetOpsPerSec})`)
  
  // Test memory usage
  const memBefore = process.memoryUsage()
  const bigBatch = []
  for (let i = 0; i < 10000; i++) {
    bigBatch.push(generatePublicId('mem'))
  }
  const memAfter = process.memoryUsage()
  
  const memUsedMB = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024
  
  return {
    iterations,
    duration,
    opsPerSec,
    targetMet: opsPerSec >= targetOpsPerSec,
    memoryUsedMB: memUsedMB,
    memoryPerIdBytes: (memAfter.heapUsed - memBefore.heapUsed) / bigBatch.length
  }
}

// =============================================================================
// CLOUDFLARE WORKERS TESTS
// =============================================================================

async function testCloudflareWorkersOptimizations() {
  console.log('   ☁️ Testing Cloudflare Workers optimizations...')
  
  // Test singleton pattern
  const generator1 = WorkersIdGenerator.getInstance()
  const generator2 = WorkersIdGenerator.getInstance()
  assert(generator1 === generator2, 'Singleton should return same instance')
  
  // Test cold start performance
  const coldStart = performance.now()
  const id1 = generator1.generateUserId()
  const coldEnd = performance.now()
  const coldStartDuration = coldEnd - coldStart
  
  assert(coldStartDuration < 50, `Cold start should be <50ms, got: ${coldStartDuration}ms`)
  
  // Test warm execution
  const warmStart = performance.now()
  for (let i = 0; i < 1000; i++) {
    generator1.generateUserId()
  }
  const warmEnd = performance.now()
  const warmDuration = warmEnd - warmStart
  const warmOpsPerSec = Math.round(1000 / (warmDuration / 1000))
  
  // Test batch generation
  const batchStart = performance.now()
  const batch = generateBatch('batch', 100)
  const batchEnd = performance.now()
  const batchDuration = batchEnd - batchStart
  
  assert(batch.length === 100, `Batch should have 100 items, got: ${batch.length}`)
  assert(batch.every(id => id.startsWith('batch_')), 'All batch items should have correct prefix')
  
  // Test RequestContext
  const context = new RequestContext()
  const contextId1 = context.getOrGenerateId('test', 'user')
  const contextId2 = context.getOrGenerateId('test', 'user') // Should return same ID
  assert(contextId1 === contextId2, 'RequestContext should return same ID for same key')
  
  const contextId3 = context.getOrGenerateId('test2', 'user')
  assert(contextId1 !== contextId3, 'RequestContext should return different ID for different key')
  
  // Test PerformanceMonitor
  const monitor = new PerformanceMonitor()
  monitor.start()
  for (let i = 0; i < 100; i++) {
    generator1.generateUserId()
    monitor.recordOperation()
  }
  const metrics = monitor.getMetrics()
  assert(metrics.operations === 100, `Should record 100 operations, got: ${metrics.operations}`)
  
  return {
    coldStartDuration,
    warmOpsPerSec,
    batchDuration,
    batchSize: batch.length,
    contextWorking: contextId1 === contextId2,
    monitorWorking: metrics.operations === 100,
    isCloudflareEnvironment: isCloudflareWorkers()
  }
}

// =============================================================================
// MAIN TEST EXECUTION
// =============================================================================

async function main() {
  console.log('🎯 Starting Comprehensive Verification Tests for Spec_010')
  console.log('================================================================')
  
  const runner = new TestRunner()
  
  try {
    // Core functionality tests
    await runner.runTest('TypeScript Branded Types', testTypeScriptBrandedTypes)
    await runner.runTest('Prefix Validation', testPrefixValidation)
    await runner.runTest('Format and Length', testFormatAndLength)
    await runner.runTest('URL-Safe Characters', testUrlSafeCharacters)
    await runner.runTest('Uniqueness (10,000 IDs)', testUniqueness)
    
    // Validation utilities tests
    await runner.runTest('Validation Utilities', testValidationUtilities)
    
    // Performance benchmarks
    await runner.runTest('Performance Benchmarks', testPerformanceBenchmarks)
    
    // Cloudflare Workers tests
    await runner.runTest('Cloudflare Workers Optimizations', testCloudflareWorkersOptimizations)
    
    // Final summary
    const summary = runner.getSummary()
    console.log('\n================================================================')
    console.log('🎉 ALL VERIFICATION TESTS COMPLETED')
    console.log('================================================================')
    console.log(`✅ Tests passed: ${summary.passed}/${summary.total}`)
    console.log(`🕐 Total duration: ${summary.totalDuration.toFixed(2)}ms`)
    console.log(`🚀 Average per test: ${(summary.totalDuration / summary.total).toFixed(2)}ms`)
    
    if (summary.success) {
      console.log('\n🎯 SPEC_010 VERIFICATION: SUCCESS')
      console.log('All functional, structural, and performance requirements met!')
      process.exit(0)
    } else {
      console.log('\n💥 SPEC_010 VERIFICATION: FAILED')
      console.log('Some requirements were not met. See test output above.')
      process.exit(1)
    }
    
  } catch (error) {
    console.log('\n💥 VERIFICATION FAILED')
    console.log('Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Execute if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}