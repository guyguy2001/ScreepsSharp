"use strict";
//todo: refactor
// Microsoft.Jsinterop
// hacking this together to bybpass the rest of the wrapper for now

// This is a single-file self-contained module to avoid the need for a Webpack build
//var DotNet;

global.DotNet = global.DotNet || {};//DotNet; // Ensure reachable from anywhere
var jsonRevivers = [];
var pendingAsyncCalls = {};
var cachedJSFunctions = {};
var nextAsyncCallId = 1; // Start at 1 because zero signals "no response needed"
var dotNetDispatcher = null;

/**
 * Sets the specified .NET call dispatcher as the current instance so that it will be used
 * for future invocations.
 *
 * @param dispatcher An object that can dispatch calls from JavaScript to a .NET runtime.
 */
function attachDispatcher(dispatcher) { dotNetDispatcher = dispatcher; }
DotNet.attachDispatcher = attachDispatcher;
/**
 * Adds a JSON reviver callback that will be used when parsing arguments received from .NET.
 * @param reviver The reviver to add.
 */
function attachReviver(reviver)
{
	jsonRevivers.push(reviver);
}
DotNet.attachReviver = attachReviver;
/**
 * Invokes the specified .NET public method synchronously. Not all hosting scenarios support
 * synchronous invocation, so if possible use invokeMethodAsync instead.
 *
 * @param assemblyName The short name (without key/version or .dll extension) of the .NET assembly containing the method.
 * @param methodIdentifier The identifier of the method to invoke. The method must have a [JSInvokable] attribute specifying this identifier.
 * @param args Arguments to pass to the method, each of which must be JSON-serializable.
 * @returns The result of the operation.
 */
function invokeMethod(assemblyName, methodIdentifier)
{
	var args = [];
	for (var _i = 2; _i < arguments.length; _i++)
	{
		args[_i - 2] = arguments[_i];
	}
	return invokePossibleInstanceMethod(assemblyName, methodIdentifier, null, args);
}
DotNet.invokeMethod = invokeMethod;
/**
 * Invokes the specified .NET public method asynchronously.
 *
 * @param assemblyName The short name (without key/version or .dll extension) of the .NET assembly containing the method.
 * @param methodIdentifier The identifier of the method to invoke. The method must have a [JSInvokable] attribute specifying this identifier.
 * @param args Arguments to pass to the method, each of which must be JSON-serializable.
 * @returns A promise representing the result of the operation.
 */
function invokeMethodAsync(assemblyName, methodIdentifier)
{
	var args = [];
	for (var _i = 2; _i < arguments.length; _i++)
	{
		args[_i - 2] = arguments[_i];
	}
	return invokePossibleInstanceMethodAsync(assemblyName, methodIdentifier, null, args);
}
DotNet.invokeMethodAsync = invokeMethodAsync;
function invokePossibleInstanceMethod(assemblyName, methodIdentifier, dotNetObjectId, args)
{
	var dispatcher = getRequiredDispatcher();
	if (dispatcher.invokeDotNetFromJS)
	{
		var argsJson = JSON.stringify(args, argReplacer);
		var resultJson = dispatcher.invokeDotNetFromJS(assemblyName, methodIdentifier, dotNetObjectId, argsJson);
		return resultJson ? parseJsonWithRevivers(resultJson) : null;
	}
	else
	{
		throw new Error('The current dispatcher does not support synchronous calls from JS to .NET. Use invokeMethodAsync instead.');
	}
}
function invokePossibleInstanceMethodAsync(assemblyName, methodIdentifier, dotNetObjectId, args)
{
	if (assemblyName && dotNetObjectId)
	{
		throw new Error("For instance method calls, assemblyName should be null. Received '" + assemblyName + "'.");
	}
	var asyncCallId = nextAsyncCallId++;
	var resultPromise = new Promise(function (resolve, reject)
	{
		pendingAsyncCalls[asyncCallId] = { resolve: resolve, reject: reject };
	});
	try
	{
		var argsJson = JSON.stringify(args, argReplacer);
		getRequiredDispatcher().beginInvokeDotNetFromJS(asyncCallId, assemblyName, methodIdentifier, dotNetObjectId, argsJson);
	}
	catch (ex)
	{
		// Synchronous failure
		completePendingCall(asyncCallId, false, ex);
	}
	return resultPromise;
}
function getRequiredDispatcher()
{
	if (dotNetDispatcher !== null) { return dotNetDispatcher; }
	throw new Error('No .NET call dispatcher has been set.');
}

function completePendingCall(asyncCallId, success, resultOrError)
{
	if (!pendingAsyncCalls.hasOwnProperty(asyncCallId))
	{
		throw new Error("There is no pending async call with ID " + asyncCallId + ".");
	}
	var asyncCall = pendingAsyncCalls[asyncCallId];
	delete pendingAsyncCalls[asyncCallId];
	if (success)
	{
		asyncCall.resolve(resultOrError);
	}
	else
	{
		asyncCall.reject(resultOrError);
	}
}
/**
 * Receives incoming calls from .NET and dispatches them to JavaScript.
 */
DotNet.jsCallDispatcher = {
    /**
     * Finds the JavaScript function matching the specified identifier.
     *
     * @param identifier Identifies the globally-reachable function to be returned.
     * @returns A Function instance.
     */
	findJSFunction: findJSFunction,
    /**
     * Invokes the specified synchronous JavaScript function.
     *
     * @param identifier Identifies the globally-reachable function to invoke.
     * @param argsJson JSON representation of arguments to be passed to the function.
     * @returns JSON representation of the invocation result.
     */
	invokeJSFromDotNet: function (identifier, argsJson)
	{
		let target = findJSFunction(identifier);
		if (target == null) { return false; }

		let result = target;
		if (target instanceof Function) { result = target.apply(target, parseJsonWithRevivers(argsJson)); }

		return result == undefined ? null : JSON.stringify(result, argReplacer);
	},
    /**
     * Invokes the specified synchronous or asynchronous JavaScript function.
     *
     * @param asyncHandle A value identifying the asynchronous operation. This value will be passed back in a later call to endInvokeJSFromDotNet.
     * @param identifier Identifies the globally-reachable function to invoke.
     * @param argsJson JSON representation of arguments to be passed to the function.
     */
	beginInvokeJSFromDotNet: function (asyncHandle, identifier, argsJson)
	{
		console.log("beginInvokeJSFromDotNet:" + identifier);
		var synchronousResultOrPromise = findJSFunction(identifier).apply(null, parseJsonWithRevivers(argsJson));
		if (!asyncHandle) { return; }
		getRequiredDispatcher().endInvokeJSFromDotNet(asyncHandle, true, JSON.stringify([asyncHandle, true, result], argReplacer));



		// Coerce synchronous functions into async ones, plus treat
		// synchronous exceptions the same as async ones
		//   var promise = new Promise(function (resolve) {
		//       var synchronousResultOrPromise = findJSFunction(identifier).apply(null, parseJsonWithRevivers(argsJson));
		//       resolve(synchronousResultOrPromise);
		//   });
		//   // We only listen for a result if the caller wants to be notified about it
		//   if (asyncHandle) {
		//       // On completion, dispatch result back to .NET
		//       // Not using "await" because it codegens a lot of boilerplate
		//       promise.then(function (result) 
		//		{ 
		//			return getRequiredDispatcher().endInvokeJSFromDotNet(asyncHandle, true, JSON.stringify([asyncHandle, true, result], argReplacer)); 
		//		}, 
		//		function (error) { return getRequiredDispatcher().endInvokeJSFromDotNet(asyncHandle, false, JSON.stringify([asyncHandle, false, formatError(error)])); }
		//		);
		//   }
	},
    /**
     * Receives notification that an async call from JS to .NET has completed.
     * @param asyncCallId The identifier supplied in an earlier call to beginInvokeDotNetFromJS.
     * @param success A flag to indicate whether the operation completed successfully.
     * @param resultOrExceptionMessage Either the operation result or an error message.
     */
	endInvokeDotNetFromJS: function (asyncCallId, success, resultOrExceptionMessage)
	{
		console.log("endInvokeCalled");
		var resultOrError = success ? resultOrExceptionMessage : new Error(resultOrExceptionMessage);
		completePendingCall(parseInt(asyncCallId), success, resultOrError);
	}
};
function parseJsonWithRevivers(json)
{
	return json ? JSON.parse(json, function (key, initialValue)
	{
		// Invoke each reviver in order, passing the output from the previous reviver,
		// so that each one gets a chance to transform the value
		return jsonRevivers.reduce(function (latestValue, reviver) { return reviver(key, latestValue); }, initialValue);
	}) : null;
}
function formatError(error)
{
	if (error instanceof Error)
	{
		return error.message + "\n" + error.stack;
	}
	else
	{
		return error ? error.toString() : 'null';
	}
}
function findJSFunction(identifier)
{
	//console.log("findJSFunction:" + identifier);
	//if (cachedJSFunctions.hasOwnProperty(identifier)) {
	//    return cachedJSFunctions[identifier];
	//}

	var result = global;
	var resultIdentifier = 'window';
	var lastSegmentValue;
	identifier.split('.').forEach(function (segment)
	{
		if (segment in result)
		{
			lastSegmentValue = result;
			result = result[segment];
			resultIdentifier += '.' + segment;
		}
		else
		{
			throw new Error("Could not find '" + segment + "' in '" + resultIdentifier + "'.");
		}
	});
	return result instanceof Function ? result.bind(lastSegmentValue) : result;
	//if (result instanceof Function) {
	//    result = result.bind(lastSegmentValue);
	//    cachedJSFunctions[identifier] = result;
	//    return result;
	//}
	//else {
	//    throw new Error("The value '" + resultIdentifier + "' is not a function.");
	//}
}
var DotNetObject = /** @class */ (function ()
{
	function DotNetObject(_id)
	{
		this._id = _id;
	}
	DotNetObject.prototype.invokeMethod = function (methodIdentifier)
	{
		var args = [];
		for (var _i = 1; _i < arguments.length; _i++)
		{
			args[_i - 1] = arguments[_i];
		}
		return invokePossibleInstanceMethod(null, methodIdentifier, this._id, args);
	};
	DotNetObject.prototype.invokeMethodAsync = function (methodIdentifier)
	{
		var args = [];
		for (var _i = 1; _i < arguments.length; _i++)
		{
			args[_i - 1] = arguments[_i];
		}
		return invokePossibleInstanceMethodAsync(null, methodIdentifier, this._id, args);
	};
	DotNetObject.prototype.dispose = function ()
	{
		var promise = invokePossibleInstanceMethodAsync(null, '__Dispose', this._id, null);
		promise.catch(function (error) { return console.error(error); });
	};
	DotNetObject.prototype.serializeAsArg = function ()
	{
		return { __dotNetObject: this._id };
	};
	return DotNetObject;
}());
var dotNetObjectRefKey = '__dotNetObject';
attachReviver(function reviveDotNetObject(key, value)
{
	if (value && typeof value === 'object' && value.hasOwnProperty(dotNetObjectRefKey))
	{
		return new DotNetObject(value.__dotNetObject);
	}
	// Unrecognized - let another reviver handle it
	return value;
});
function argReplacer(key, value)
{
	return value instanceof DotNetObject ? value.serializeAsArg() : value;
}