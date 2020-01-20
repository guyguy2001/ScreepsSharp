using Microsoft.AspNetCore.Blazor.Hosting;
using Microsoft.JSInterop;
using ScreepsSharp.Core;
using ScreepsSharp.Core.RoomObjects;
using ScreepsSharp.Blazor;
using System;
using System.Linq;


namespace ScreepsSharp.Tutorial.Section5
{

	public class Program
	{
		private static bool _initialized = false;
		private static void Log(string s) { Game.js.InvokeVoid("console.log", s); }

		public static void TickRoom(IRoom room)
		{
			if (!(room.controller?.my ?? false)) { return; }
			Log(room.name);
			var towers = room.FindMine<ITower>();

			var damaged = room.FindMine<IStructure>()
				.Where(o => o.hits < o.hitsMax)
				.ToArray();

			var hostiles = room.FindHostile<ICreepBase>();

			var spawns = room.FindMine<ISpawn>();

			foreach (var tower in towers)
			{
				if (hostiles.Length > 0)
				{
					tower.Attack(hostiles[0]);
					break; //continue; // NCP's need not apply. Only one tower for you!
				}

				if (damaged.Length > 0) { tower.Repair(damaged[0]); }

				break; //continue;
			}

			ICreep creep;
			var parts = new[] { Bodypart.move, Bodypart.move, Bodypart.carry, Bodypart.work };
			if (TryGetCreepOrSpawn(room.name + "harvester", out creep, parts, spawns.FirstOrDefault()))
			{
				Roles.Harvester(creep);
			}

			if (TryGetCreepOrSpawn(room.name + "upgrader", out creep, parts, spawns.FirstOrDefault()))
			{
				Roles.Upgrader(creep);
			}

			if (TryGetCreepOrSpawn(room.name + "builder", out creep, parts, spawns.FirstOrDefault()))
			{
				Roles.Builder(creep);
			}
		}

		public static bool TryGetCreepOrSpawn(string name, out ICreep creep, Bodypart[] parts, ISpawn spawn)
		{
			if (Game.instance.creeps.TryGetValue(name, out creep)) { return true; }

			Log(spawn?.SpawnCreep(parts, name).ToString() ?? "-42");

			return false;
		}

		public static void Main(string[] args)
		{
			if (!_initialized)
			{
				Game.Initialize(new BlazorGame());
				_initialized = true;
			}

			Log("Main Called");

			try { Game.instance.OnTickStart(); }
			catch (Exception ex)
			{
				Log($"Initialization failed:\n${ex.ToString()}");
				return;
			}

			foreach (var room in Game.instance.rooms.Values)
			{
				try { TickRoom(room); }
				catch (Exception ex) { Log(ex.ToString()); }
			}

		}

	}
}
